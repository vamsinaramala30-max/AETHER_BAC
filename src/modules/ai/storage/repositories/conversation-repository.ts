/**
 * AETHER AI — Conversation Repository
 * Persistence layer for user conversations. Pure persistence only — no business logic.
 */

import type { Conversation } from '../../conversations/conversation-types.js';

export interface IConversationRepository {
  save(conversation: Conversation): Promise<void>;
  getById(id: string, userId: string): Promise<Conversation | undefined>;
  getByUser(userId: string): Promise<readonly Conversation[]>;
  delete(id: string, userId: string): Promise<boolean>;
}

export class ConversationRepository implements IConversationRepository {
  private readonly conversations = new Map<string, Conversation>();

  public async save(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  public async getById(id: string, userId: string): Promise<Conversation | undefined> {
    const conv = this.conversations.get(id);
    if (!conv || conv.userId !== userId) {
      return undefined;
    }
    return conv;
  }

  public async getByUser(userId: string): Promise<readonly Conversation[]> {
    const userConvs: Conversation[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.userId === userId) {
        userConvs.push(conv);
      }
    }
    return userConvs.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async delete(id: string, userId: string): Promise<boolean> {
    const conv = this.conversations.get(id);
    if (!conv || conv.userId !== userId) {
      return false;
    }
    return this.conversations.delete(id);
  }
}

export const conversationRepository = new ConversationRepository();
