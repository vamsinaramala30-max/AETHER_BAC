/**
 * AETHER AI — Message Repository
 * Persistence layer for conversation messages. Pure persistence only — no business logic.
 */

import type { ConversationMessage } from '../../conversations/conversation-types.js';

export interface IMessageRepository {
  save(userId: string, message: ConversationMessage): Promise<void>;
  getByConversation(conversationId: string, userId: string): Promise<readonly ConversationMessage[]>;
  deleteByConversation(conversationId: string, userId: string): Promise<void>;
}

export class MessageRepository implements IMessageRepository {
  private readonly messages = new Map<string, ConversationMessage>();
  private readonly userOwnerMap = new Map<string, string>(); // messageId -> userId

  public async save(userId: string, message: ConversationMessage): Promise<void> {
    this.messages.set(message.id, message);
    this.userOwnerMap.set(message.id, userId);
  }

  public async getByConversation(conversationId: string, userId: string): Promise<readonly ConversationMessage[]> {
    const results: ConversationMessage[] = [];
    for (const msg of this.messages.values()) {
      if (msg.conversationId === conversationId && this.userOwnerMap.get(msg.id) === userId) {
        results.push(msg);
      }
    }
    return results.sort((a, b) => a.createdAt - b.createdAt);
  }

  public async deleteByConversation(conversationId: string, userId: string): Promise<void> {
    for (const [id, msg] of this.messages) {
      if (msg.conversationId === conversationId && this.userOwnerMap.get(id) === userId) {
        this.messages.delete(id);
        this.userOwnerMap.delete(id);
      }
    }
  }
}

export const messageRepository = new MessageRepository();
