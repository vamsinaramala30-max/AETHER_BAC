import type { ConversationMessage } from '../../conversations/conversation-types.js';
import { db } from '../../../../database/client';
import crypto from 'node:crypto';

function toUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface IMessageRepository {
  save(userId: string, message: ConversationMessage): Promise<void>;
  getByConversation(
    conversationId: string,
    userId: string,
  ): Promise<readonly ConversationMessage[]>;
  deleteByConversation(conversationId: string, userId: string): Promise<void>;
}

export class MessageRepository implements IMessageRepository {
  private readonly memoryMessages = new Map<string, ConversationMessage>();
  private readonly userOwnerMap = new Map<string, string>();

  public async save(userId: string, message: ConversationMessage): Promise<void> {
    this.memoryMessages.set(message.id, message);
    this.userOwnerMap.set(message.id, userId);

    try {
      const validConvId = toUuid(message.conversationId);
      const validSenderId = toUuid(userId);
      const validMsgId = toUuid(message.id);

      await db.message.create({
        data: {
          id: validMsgId,
          conversationId: validConvId,
          senderId: validSenderId,
          role: message.role.toUpperCase(),
          content: message.content,
          tokensUsed: 0,
          createdAt: new Date(message.createdAt),
        },
      });
    } catch {
      // Graceful fallback to memory store
    }
  }

  public async getByConversation(
    conversationId: string,
    userId: string,
  ): Promise<readonly ConversationMessage[]> {
    const validConvId = toUuid(conversationId);
    let dbMsgs: ConversationMessage[] = [];

    try {
      const records = await db.message.findMany({
        where: { conversationId: validConvId },
        orderBy: { createdAt: 'asc' },
      });
      dbMsgs = records.map((r) => ({
        id: r.id,
        conversationId,
        role: (r.role.toLowerCase() as 'user' | 'assistant' | 'system') || 'user',
        content: r.content,
        createdAt: r.createdAt.getTime(),
      }));
      for (const m of dbMsgs) {
        this.memoryMessages.set(m.id, m);
        this.userOwnerMap.set(m.id, userId);
      }
    } catch {
      // Memory fallback
    }

    if (dbMsgs.length > 0) {
      return dbMsgs;
    }

    const results: ConversationMessage[] = [];
    for (const msg of this.memoryMessages.values()) {
      if (msg.conversationId === conversationId && this.userOwnerMap.get(msg.id) === userId) {
        results.push(msg);
      }
    }
    return results.sort((a, b) => a.createdAt - b.createdAt);
  }

  public async deleteByConversation(conversationId: string, userId: string): Promise<void> {
    for (const [id, msg] of this.memoryMessages) {
      if (msg.conversationId === conversationId && this.userOwnerMap.get(id) === userId) {
        this.memoryMessages.delete(id);
        this.userOwnerMap.delete(id);
      }
    }

    try {
      const validConvId = toUuid(conversationId);
      await db.message.deleteMany({
        where: { conversationId: validConvId },
      });
    } catch {
      // Fallback ignore
    }
  }
}

export const messageRepository = new MessageRepository();
