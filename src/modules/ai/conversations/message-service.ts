/**
 * AETHER AI — Message Service
 * Manages messages within user-scoped conversations.
 * Supports roles: system, user, assistant, tool.
 */

import type { ConversationMessage, AddMessageRequest } from './conversation-types.js';
import type { IMessageRepository } from '../storage/repositories/message-repository.js';
import { messageRepository } from '../storage/repositories/message-repository.js';

export interface IMessageService {
  addMessage(request: AddMessageRequest): Promise<ConversationMessage>;
  getMessages(conversationId: string, userId: string): Promise<readonly ConversationMessage[]>;
  deleteMessagesByConversation(conversationId: string, userId: string): Promise<void>;
}

export class MessageService implements IMessageService {
  constructor(private readonly repo: IMessageRepository = messageRepository) {}

  public async addMessage(request: AddMessageRequest): Promise<ConversationMessage> {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const msg: ConversationMessage = {
      id,
      conversationId: request.conversationId,
      role: request.role,
      content: request.content,
      toolName: request.toolName,
      toolCallId: request.toolCallId,
      createdAt: Date.now(),
      metadata: request.metadata,
    };

    await this.repo.save(request.userId, msg);
    return msg;
  }

  public async getMessages(
    conversationId: string,
    userId: string,
  ): Promise<readonly ConversationMessage[]> {
    return this.repo.getByConversation(conversationId, userId);
  }

  public async deleteMessagesByConversation(conversationId: string, userId: string): Promise<void> {
    await this.repo.deleteByConversation(conversationId, userId);
  }
}

export const messageService = new MessageService();
