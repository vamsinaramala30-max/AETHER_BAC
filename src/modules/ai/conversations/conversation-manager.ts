/**
 * AETHER AI — Conversation Manager
 * Core management service for conversation lifecycles: create, list, get, rename, delete.
 * All operations are strictly user-scoped.
 */

import type { Conversation, CreateConversationRequest, UpdateConversationRequest } from './conversation-types.js';
import type { IConversationRepository } from '../storage/repositories/conversation-repository.js';
import { conversationRepository } from '../storage/repositories/conversation-repository.js';
import type { IMessageService } from './message-service.js';
import { messageService } from './message-service.js';

export interface IConversationManager {
  createConversation(request: CreateConversationRequest): Promise<Conversation>;
  listConversations(userId: string): Promise<readonly Conversation[]>;
  getConversation(conversationId: string, userId: string): Promise<Conversation | undefined>;
  renameConversation(request: UpdateConversationRequest): Promise<Conversation | undefined>;
  deleteConversation(conversationId: string, userId: string): Promise<boolean>;
}

export class ConversationManager implements IConversationManager {
  constructor(
    private readonly repo: IConversationRepository = conversationRepository,
    private readonly msgService: IMessageService = messageService,
  ) {}

  public async createConversation(request: CreateConversationRequest): Promise<Conversation> {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const conv: Conversation = {
      id,
      userId: request.userId,
      title: request.title ?? 'New Conversation',
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      metadata: request.metadata,
    };

    await this.repo.save(conv);
    return conv;
  }

  public async listConversations(userId: string): Promise<readonly Conversation[]> {
    return this.repo.getByUser(userId);
  }

  public async getConversation(conversationId: string, userId: string): Promise<Conversation | undefined> {
    return this.repo.getById(conversationId, userId);
  }

  public async renameConversation(request: UpdateConversationRequest): Promise<Conversation | undefined> {
    const existing = await this.repo.getById(request.conversationId, request.userId);
    if (!existing) return undefined;

    const updated: Conversation = {
      ...existing,
      title: request.title ?? existing.title,
      metadata: request.metadata ? { ...existing.metadata, ...request.metadata } : existing.metadata,
      updatedAt: Date.now(),
    };

    await this.repo.save(updated);
    return updated;
  }

  public async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const deleted = await this.repo.delete(conversationId, userId);
    if (deleted) {
      await this.msgService.deleteMessagesByConversation(conversationId, userId);
    }
    return deleted;
  }
}

export const conversationManager = new ConversationManager();
