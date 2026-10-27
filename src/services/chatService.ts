import * as chats from '../repositories/chatRepository';
import * as msgs from '../repositories/messageRepository';
import { badRequest, forbidden, notFound } from '../errors';
import { Chat, LastSeen, Message, ReadReceipt } from '../types';

async function requireMember(chatId: string, userId: string): Promise<void> {
  if (!(await chats.getChatById(chatId))) throw notFound('Chat not found');
  if (!(await chats.isMember(chatId, userId))) throw forbidden('User is not a member of this chat');
}

async function requireAdmin(chatId: string, userId: string): Promise<void> {
  const chat = await chats.getChatById(chatId);
  if (!chat) throw notFound('Chat not found');
  if (chat.type !== 'group') throw badRequest('Operation only valid for group chats');
  if ((await chats.getMemberRole(chatId, userId)) !== 'admin') throw forbidden('Admin role required');
}

export const createOrGetChat = (a: string, b: string) => chats.findOrCreateDirectChat(a, b);

export async function sendMessage(chatId: string, senderId: string, text: string): Promise<Message> {
  await requireMember(chatId, senderId);
  return msgs.createMessage(chatId, senderId, text);
}

export async function getMessages(chatId: string, userId: string, limit: number, before?: Date): Promise<Message[]> {
  await requireMember(chatId, userId);
  return msgs.listMessages(chatId, limit, before);
}

export async function markRead(chatId: string, messageId: string, userId: string): Promise<ReadReceipt> {
  await requireMember(chatId, userId);
  const message = await msgs.getMessage(chatId, messageId);
  if (message.senderId === userId) throw badRequest('Cannot mark your own message as read');
  return msgs.markRead(chatId, messageId, userId);
}

export async function updateLastSeen(chatId: string, userId: string, messageId: string): Promise<LastSeen> {
  await requireMember(chatId, userId);
  return msgs.updateLastSeen(chatId, userId, messageId);
}

export async function listUserChats(userId: string): Promise<Chat[]> {
  if (!(await chats.getUser(userId))) throw notFound('User not found');
  return chats.listUserChats(userId);
}

// ---- Bonus: groups & message edit/delete ----
export const createGroup = (creatorId: string, name: string, memberIds: string[]) =>
  chats.createGroupChat(creatorId, name, memberIds);

export async function addGroupMember(chatId: string, requesterId: string, userId: string): Promise<Chat> {
  await requireAdmin(chatId, requesterId);
  await chats.addMember(chatId, userId);
  return (await chats.getChatById(chatId)) as Chat;
}

export async function removeGroupMember(chatId: string, requesterId: string, userId: string): Promise<Chat> {
  const chat = await chats.getChatById(chatId);
  if (!chat) throw notFound('Chat not found');
  if (chat.type !== 'group') throw badRequest('Operation only valid for group chats');
  if (requesterId !== userId) await requireAdmin(chatId, requesterId); // members may leave on their own
  else await requireMember(chatId, requesterId);
  await chats.removeMember(chatId, userId);
  return (await chats.getChatById(chatId)) as Chat;
}

export async function editMessage(chatId: string, messageId: string, senderId: string, text: string): Promise<Message> {
  await requireMember(chatId, senderId);
  return msgs.editMessage(chatId, messageId, senderId, text);
}

export async function deleteMessage(chatId: string, messageId: string, senderId: string): Promise<void> {
  await requireMember(chatId, senderId);
  await msgs.deleteMessage(chatId, messageId, senderId);
}
