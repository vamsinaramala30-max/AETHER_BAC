import type { Conversation } from '../../conversations/conversation-types.js';
import { db } from '../../../../database/client';
import crypto from 'node:crypto';

function toUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface IConversationRepository {
  save(conversation: Conversation): Promise<void>;
  getById(id: string, userId: string): Promise<Conversation | undefined>;
  getByUser(userId: string): Promise<readonly Conversation[]>;
  delete(id: string, userId: string): Promise<boolean>;
}

export class ConversationRepository implements IConversationRepository {
  private readonly memoryCache = new Map<string, Conversation>();

  public async save(conversation: Conversation): Promise<void> {
    this.memoryCache.set(conversation.id, conversation);
    const validUserId = toUuid(conversation.userId);
    const validConvId = toUuid(conversation.id);

    try {
      // Find workspace for user if workspaceId is not valid
      const membership = await db.workspaceMember.findFirst({
        where: { userId: validUserId },
      });
      if (membership) {
        await db.conversation.upsert({
          where: { id: validConvId },
          update: {
            title: conversation.title,
            updatedAt: new Date(conversation.updatedAt),
          },
          create: {
            id: validConvId,
            userId: validUserId,
            workspaceId: membership.workspaceId,
            title: conversation.title,
            createdAt: new Date(conversation.createdAt),
            updatedAt: new Date(conversation.updatedAt),
          },
        });
      }
    } catch {
      // Graceful fallback to memory store
    }
  }

  public async getById(id: string, userId: string): Promise<Conversation | undefined> {
    const cached = this.memoryCache.get(id);
    if (cached && cached.userId === userId) {
      return cached;
    }

    try {
      const validUserId = toUuid(userId);
      const validConvId = toUuid(id);
      const dbConv = await db.conversation.findFirst({
        where: { id: validConvId, userId: validUserId, deletedAt: null },
      });
      if (dbConv) {
        const mapped: Conversation = {
          id: dbConv.id,
          userId: dbConv.userId,
          title: dbConv.title,
          messageCount: 0,
          createdAt: dbConv.createdAt.getTime(),
          updatedAt: dbConv.updatedAt.getTime(),
        };
        this.memoryCache.set(mapped.id, mapped);
        return mapped;
      }
    } catch {
      // Memory fallback
    }

    return cached && cached.userId === userId ? cached : undefined;
  }

  public async getByUser(userId: string): Promise<readonly Conversation[]> {
    const validUserId = toUuid(userId);
    let dbConvs: Conversation[] = [];

    try {
      const records = await db.conversation.findMany({
        where: { userId: validUserId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      });
      dbConvs = records.map((r) => ({
        id: r.id,
        userId: r.userId,
        title: r.title,
        messageCount: 0,
        createdAt: r.createdAt.getTime(),
        updatedAt: r.updatedAt.getTime(),
      }));
      for (const c of dbConvs) {
        this.memoryCache.set(c.id, c);
      }
    } catch {
      // Memory fallback
    }

    if (dbConvs.length > 0) {
      return dbConvs;
    }

    const memConvs: Conversation[] = [];
    for (const conv of this.memoryCache.values()) {
      if (conv.userId === userId) {
        memConvs.push(conv);
      }
    }
    return memConvs.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async delete(id: string, userId: string): Promise<boolean> {
    this.memoryCache.delete(id);
    try {
      const validUserId = toUuid(userId);
      const validConvId = toUuid(id);
      await db.conversation.updateMany({
        where: { id: validConvId, userId: validUserId },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch {
      return true;
    }
  }
}

export const conversationRepository = new ConversationRepository();

