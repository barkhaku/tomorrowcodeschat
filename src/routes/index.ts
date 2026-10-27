import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import * as service from '../services/chatService';
import * as chatRepo from '../repositories/chatRepository';

const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const id = z.string().uuid();
const text = z.string().trim().min(1).max(4000);

export const router = Router();

// Helper endpoint so the API can be exercised without a separate user service
router.post('/users', wrap(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  res.status(201).json(await chatRepo.createUser(name));
}));

// 1. Create or get chat
router.post('/chat/create', wrap(async (req, res) => {
  const { userAId, userBId } = z.object({ userAId: id, userBId: id }).parse(req.body);
  const { chat, created } = await service.createOrGetChat(userAId, userBId);
  res.status(created ? 201 : 200).json({ chatId: chat.id });
}));

// 2. Send message
router.post('/chat/:chatId/message/send', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const { senderId, text: body } = z.object({ senderId: id, text }).parse(req.body);
  res.status(201).json(await service.sendMessage(chatId, senderId, body));
}));

// 3. Get messages (userId identifies the requester; there is no auth layer in this exercise)
router.get('/chat/:chatId/messages', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const q = z.object({
    userId: id,
    limit: z.coerce.number().int().min(1).max(200).default(50),
    before: z.string().datetime().optional(),
  }).parse(req.query);
  const messages = await service.getMessages(chatId, q.userId, q.limit, q.before ? new Date(q.before) : undefined);
  res.json({ messages });
}));

// 4. Mark message read
router.post('/chat/:chatId/message/:messageId/read', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const messageId = z.string().min(1).parse(req.params.messageId);
  const { userId } = z.object({ userId: id }).parse(req.body);
  res.json(await service.markRead(chatId, messageId, userId));
}));

// 5. Update last seen message
router.post('/chat/:chatId/lastseen', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const { userId, messageId } = z.object({ userId: id, messageId: z.string().min(1) }).parse(req.body);
  res.json(await service.updateLastSeen(chatId, userId, messageId));
}));

// 6. List user chats
router.get('/user/:userId/chats', wrap(async (req, res) => {
  const userId = id.parse(req.params.userId);
  res.json({ chats: await service.listUserChats(userId) });
}));

// ---------- Bonus ----------
router.post('/chat/group', wrap(async (req, res) => {
  const b = z.object({ creatorId: id, name: z.string().trim().min(1).max(100), memberIds: z.array(id).min(1) }).parse(req.body);
  res.status(201).json(await service.createGroup(b.creatorId, b.name, b.memberIds));
}));

router.post('/chat/:chatId/members', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const b = z.object({ requesterId: id, userId: id }).parse(req.body);
  res.json(await service.addGroupMember(chatId, b.requesterId, b.userId));
}));

router.delete('/chat/:chatId/members/:userId', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const userId = id.parse(req.params.userId);
  const { requesterId } = z.object({ requesterId: id }).parse(req.body);
  res.json(await service.removeGroupMember(chatId, requesterId, userId));
}));

router.patch('/chat/:chatId/message/:messageId', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const messageId = z.string().min(1).parse(req.params.messageId);
  const b = z.object({ senderId: id, text }).parse(req.body);
  res.json(await service.editMessage(chatId, messageId, b.senderId, b.text));
}));

router.delete('/chat/:chatId/message/:messageId', wrap(async (req, res) => {
  const chatId = id.parse(req.params.chatId);
  const messageId = z.string().min(1).parse(req.params.messageId);
  const { senderId } = z.object({ senderId: id }).parse(req.body);
  await service.deleteMessage(chatId, messageId, senderId);
  res.status(204).send();
}));
