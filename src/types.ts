export type ChatType = 'direct' | 'group';
export type MemberRole = 'admin' | 'member';

export interface User {
  id: string;
  name: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  type: ChatType;
  name: string | null;
  memberIds: string[];
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string | null;
  editedAt: string | null;
  deleted: boolean;
}

export interface ReadReceipt {
  messageId: string;
  userId: string;
  readAt: string | null;
}

export interface LastSeen {
  userId: string;
  messageId: string;
  updatedAt: string | null;
}
