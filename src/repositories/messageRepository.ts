import { DocumentSnapshot, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../firebase';
import { forbidden, notFound } from '../errors';
import { LastSeen, Message, ReadReceipt } from '../types';

/*
 * Firestore layout
 *   chats/{chatId}/messages/{messageId}                  { senderId, text, createdAt, editedAt, deleted }
 *   chats/{chatId}/messages/{messageId}/reads/{userId}   { userId, readAt }
 *   chats/{chatId}/lastSeen/{userId}                     { userId, messageId, updatedAt }
 */
const messages = (chatId: string) => firestore.collection('chats').doc(chatId).collection('messages');
const lastSeenCol = (chatId: string) => firestore.collection('chats').doc(chatId).collection('lastSeen');

const iso = (v: unknown): string | null => (v instanceof Timestamp ? v.toDate().toISOString() : null);

function toMessage(chatId: string, snap: DocumentSnapshot): Message {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    chatId,
    senderId: String(d.senderId),
    text: String(d.text ?? ''),
    createdAt: iso(d.createdAt),
    editedAt: iso(d.editedAt),
    deleted: Boolean(d.deleted),
  };
}

export async function createMessage(chatId: string, senderId: string, text: string): Promise<Message> {
  const ref = messages(chatId).doc();
  await ref.set({ senderId, text, createdAt: FieldValue.serverTimestamp(), editedAt: null, deleted: false });
  return toMessage(chatId, await ref.get());
}

/** Returns the latest `limit` messages, oldest -> newest. `before` enables pagination. */
export async function listMessages(chatId: string, limit: number, before?: Date): Promise<Message[]> {
  let q = messages(chatId).orderBy('createdAt', 'desc').limit(limit);
  if (before) q = q.where('createdAt', '<', Timestamp.fromDate(before));
  const snap = await q.get();
  return snap.docs.map((d) => toMessage(chatId, d)).reverse();
}

export async function getMessage(chatId: string, messageId: string): Promise<Message> {
  const snap = await messages(chatId).doc(messageId).get();
  if (!snap.exists) throw notFound('Message not found');
  return toMessage(chatId, snap);
}

export async function editMessage(chatId: string, messageId: string, senderId: string, text: string): Promise<Message> {
  const ref = messages(chatId).doc(messageId);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Message not found');
    const data = snap.data() ?? {};
    if (data.senderId !== senderId) throw forbidden('Only the sender can edit a message');
    if (data.deleted) throw notFound('Message was deleted');
    tx.update(ref, { text, editedAt: FieldValue.serverTimestamp() });
  });
  return toMessage(chatId, await ref.get());
}

/** Soft delete so ordering, read receipts and last-seen pointers stay valid. */
export async function deleteMessage(chatId: string, messageId: string, senderId: string): Promise<void> {
  const ref = messages(chatId).doc(messageId);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Message not found');
    if ((snap.data() ?? {}).senderId !== senderId) throw forbidden('Only the sender can delete a message');
    tx.update(ref, { text: '', deleted: true, editedAt: FieldValue.serverTimestamp() });
  });
}

/** Idempotent: the first read time is preserved. */
export async function markRead(chatId: string, messageId: string, userId: string): Promise<ReadReceipt> {
  const msgRef = messages(chatId).doc(messageId);
  const receiptRef = msgRef.collection('reads').doc(userId);

  await firestore.runTransaction(async (tx) => {
    const [msg, receipt] = await Promise.all([tx.get(msgRef), tx.get(receiptRef)]);
    if (!msg.exists) throw notFound('Message not found');
    if (!receipt.exists) tx.set(receiptRef, { userId, readAt: FieldValue.serverTimestamp() });
  });

  const d = (await receiptRef.get()).data() ?? {};
  return { messageId, userId, readAt: iso(d.readAt) };
}

/** Pointer only moves forward (by message timestamp); older messageIds are ignored. */
export async function updateLastSeen(chatId: string, userId: string, messageId: string): Promise<LastSeen> {
  const msgRef = messages(chatId).doc(messageId);
  const seenRef = lastSeenCol(chatId).doc(userId);

  await firestore.runTransaction(async (tx) => {
    const [msg, seen] = await Promise.all([tx.get(msgRef), tx.get(seenRef)]);
    if (!msg.exists) throw notFound('Message not found');

    if (seen.exists) {
      const currentId = String((seen.data() ?? {}).messageId);
      if (currentId !== messageId) {
        const currentMsg = await tx.get(messages(chatId).doc(currentId));
        const cur = currentMsg.get('createdAt') as Timestamp | undefined;
        const next = msg.get('createdAt') as Timestamp | undefined;
        if (cur && next && next.toMillis() < cur.toMillis()) return; // never move backwards
      }
    }
    tx.set(seenRef, { userId, messageId, updatedAt: FieldValue.serverTimestamp() });
  });

  const d = (await seenRef.get()).data() ?? {};
  return { userId, messageId: String(d.messageId), updatedAt: iso(d.updatedAt) };
}
