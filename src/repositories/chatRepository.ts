import { randomUUID } from 'crypto';
import { Connection, RowDataPacket } from 'mysql2/promise';
import { pool, withTransaction } from '../db';
import { badRequest, notFound } from '../errors';
import { Chat, ChatType, MemberRole, User } from '../types';

interface UserRow extends RowDataPacket { id: string; name: string; created_at: Date }
interface ChatRow extends RowDataPacket { id: string; type: ChatType; name: string | null; created_at: Date }
interface MemberRow extends RowDataPacket { chat_id: string; user_id: string }
interface IdRow extends RowDataPacket { id: string }
interface RoleRow extends RowDataPacket { role: MemberRole }

const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, createdAt: r.created_at.toISOString() });
const toChat = (r: ChatRow, memberIds: string[]): Chat => ({
  id: r.id, type: r.type, name: r.name, memberIds, createdAt: r.created_at.toISOString(),
});

async function loadMembers(chatIds: string[], db: Connection = pool): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (chatIds.length === 0) return map;
  const [rows] = await db.query<MemberRow[]>(
    'SELECT chat_id, user_id FROM chat_members WHERE chat_id IN (?) ORDER BY joined_at, user_id', [chatIds]);
  for (const r of rows) {
    const list = map.get(r.chat_id) ?? [];
    list.push(r.user_id);
    map.set(r.chat_id, list);
  }
  return map;
}

export async function createUser(name: string): Promise<User> {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, name) VALUES (?, ?)', [id, name]);
  const [rows] = await pool.query<UserRow[]>('SELECT id, name, created_at FROM users WHERE id = ?', [id]);
  return toUser(rows[0] as UserRow);
}

export async function getUser(id: string): Promise<User | null> {
  const [rows] = await pool.query<UserRow[]>('SELECT id, name, created_at FROM users WHERE id = ?', [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

async function assertUsersExist(conn: Connection, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const [rows] = await conn.query<IdRow[]>('SELECT id FROM users WHERE id IN (?)', [unique]);
  if (rows.length !== unique.length) {
    const found = new Set(rows.map((r) => r.id));
    throw notFound(`User(s) not found: ${unique.filter((i) => !found.has(i)).join(', ')}`);
  }
}

export async function getChatById(id: string): Promise<Chat | null> {
  const [rows] = await pool.query<ChatRow[]>('SELECT id, type, name, created_at FROM chats WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return null;
  const members = await loadMembers([id]);
  return toChat(row, members.get(id) ?? []);
}

export async function isMember(chatId: string, userId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
  return rows.length > 0;
}

export async function getMemberRole(chatId: string, userId: string): Promise<MemberRole | null> {
  const [rows] = await pool.query<RoleRow[]>(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
  return rows[0]?.role ?? null;
}

function isDuplicateEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

/** Idempotent: always returns the same chat for the same pair, regardless of argument order. */
export async function findOrCreateDirectChat(userAId: string, userBId: string): Promise<{ chat: Chat; created: boolean }> {
  if (userAId === userBId) throw badRequest('userAId and userBId must be different');
  const [first, second] = [userAId, userBId].sort() as [string, string];
  const directKey = `${first}:${second}`;

  const { chatId, created } = await withTransaction(async (conn) => {
    await assertUsersExist(conn, [first, second]);
    const newId = randomUUID();
    try {
      await conn.query(
        `INSERT INTO chats (id, type, direct_key, created_by) VALUES (?, 'direct', ?, ?)`, [newId, directKey, userAId]);
      await conn.query('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?), (?, ?)',
        [newId, first, newId, second]);
      return { chatId: newId, created: true };
    } catch (err) {
      if (!isDuplicateEntry(err)) throw err;
      // Chat already exists (or a concurrent request created it). Locking read sees the latest committed row.
      const [rows] = await conn.query<IdRow[]>('SELECT id FROM chats WHERE direct_key = ? FOR UPDATE', [directKey]);
      return { chatId: (rows[0] as IdRow).id, created: false };
    }
  });

  return { chat: (await getChatById(chatId)) as Chat, created };
}

export async function createGroupChat(creatorId: string, name: string, memberIds: string[]): Promise<Chat> {
  const all = [...new Set([creatorId, ...memberIds])];
  const chatId = randomUUID();
  await withTransaction(async (conn) => {
    await assertUsersExist(conn, all);
    await conn.query(`INSERT INTO chats (id, type, name, created_by) VALUES (?, 'group', ?, ?)`, [chatId, name, creatorId]);
    for (const uid of all) {
      await conn.query('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)',
        [chatId, uid, uid === creatorId ? 'admin' : 'member']);
    }
  });
  return (await getChatById(chatId)) as Chat;
}

export async function addMember(chatId: string, userId: string): Promise<void> {
  await withTransaction(async (conn) => {
    await assertUsersExist(conn, [userId]);
    await conn.query(
      'INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE chat_id = chat_id',
      [chatId, userId]);
  });
}

export async function removeMember(chatId: string, userId: string): Promise<void> {
  await pool.query('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
}

export async function listUserChats(userId: string): Promise<Chat[]> {
  const [rows] = await pool.query<ChatRow[]>(
    `SELECT c.id, c.type, c.name, c.created_at
       FROM chats c JOIN chat_members m ON m.chat_id = c.id
      WHERE m.user_id = ? ORDER BY c.created_at DESC`, [userId]);
  const members = await loadMembers(rows.map((r) => r.id));
  return rows.map((r) => toChat(r, members.get(r.id) ?? []));
}
