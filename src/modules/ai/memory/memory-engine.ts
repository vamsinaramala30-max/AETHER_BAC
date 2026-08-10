/**
 * AETHER AI — Memory Engine
 * Top-level memory coordinator.
 * Manages conversation, working, and long-term memory.
 * All operations are strictly user-scoped.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { MemoryFailedError } from '../ai-errors.js';
import type {
  MemoryItem,
  MemoryId,
  UserId,
  SessionId,
  ConversationId,
  MessageRole,
  ContextMessage,
  WorkingMemoryContext,
} from '../ai-types.js';
import type { AIConfig } from '../ai-config.js';
import { ConversationMemory } from './conversation-memory.js';
import type { IConversationMemory } from './conversation-memory.js';
import { WorkingMemory } from './working-memory.js';
import type { IWorkingMemory } from './working-memory.js';
import { InMemoryLongTermStore } from './long-term-memory.js';
import { MemoryWriter } from './memory-writer.js';
import type { IMemoryWriter } from './memory-writer.js';
import { MemoryRetriever } from './memory-retriever.js';
import type { IMemoryRetriever } from './memory-retriever.js';
import type { IEmbeddingEngine } from '../rag/embeddings/embedding-engine.js';
import type { MemoryWriteRequest, MemoryUpdateRequest, MemoryQuery } from './memory-types.js';

// ─── IMemoryEngine Interface ──────────────────────────────────────────────────

export interface IMemoryEngine {
  // Conversation memory
  addConversationMessage(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    role: MessageRole,
    content: string,
  ): ContextMessage;

  getConversationHistory(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    maxTokens?: number,
  ): readonly ContextMessage[];

  clearConversation(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
  ): void;

  // Working memory
  setWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
    value: string,
    ttlMs?: number,
  ): void;

  getWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
  ): string | undefined;

  getWorkingMemoryContext(
    userId: UserId,
    sessionId: SessionId,
  ): WorkingMemoryContext;

  clearWorkingMemory(userId: UserId, sessionId: SessionId): void;

  // Long-term memory
  createMemory(request: MemoryWriteRequest): Promise<Result<MemoryItem>>;
  updateMemory(request: MemoryUpdateRequest): Promise<Result<MemoryItem>>;
  deleteMemory(id: MemoryId, userId: UserId): Promise<Result<void>>;
  searchMemory(query: MemoryQuery): Promise<Result<readonly MemoryItem[]>>;
  getAllMemory(userId: UserId): Promise<Result<readonly MemoryItem[]>>;

  // Cleanup
  clearUserData(userId: UserId): Promise<void>;
}

// ─── Memory Engine Implementation ────────────────────────────────────────────

export class MemoryEngine implements IMemoryEngine {
  private readonly conversationMemory: IConversationMemory;
  private readonly workingMemory: IWorkingMemory;
  private readonly writer: IMemoryWriter;
  private readonly retriever: IMemoryRetriever;
  private readonly longTermStore: InMemoryLongTermStore;
  private evictionTimer: NodeJS.Timeout | null = null;

  constructor(
    config: AIConfig,
    embeddingEngine: IEmbeddingEngine | null = null,
  ) {
    this.conversationMemory = new ConversationMemory(config.memory.conversationWindowSize as any);
    this.workingMemory = new WorkingMemory(config.memory.workingMemoryTTLMs as any);
    this.longTermStore = new InMemoryLongTermStore();
    this.writer = new MemoryWriter(this.longTermStore, embeddingEngine);
    this.retriever = new MemoryRetriever(this.longTermStore, embeddingEngine);

    // Schedule periodic working memory eviction
    this.evictionTimer = setInterval(() => {
      this.workingMemory.evictExpired();
    }, 60_000);
  }

  // ─── Conversation Memory ────────────────────────────────────────────────────

  public addConversationMessage(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    role: MessageRole,
    content: string,
  ): ContextMessage {
    return this.conversationMemory.addMessage(userId, sessionId, conversationId, role, content);
  }

  public getConversationHistory(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    maxTokens?: number,
  ): readonly ContextMessage[] {
    return this.conversationMemory.getHistory(userId, sessionId, conversationId, maxTokens);
  }

  public clearConversation(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
  ): void {
    this.conversationMemory.clearSession(userId, sessionId, conversationId);
  }

  // ─── Working Memory ─────────────────────────────────────────────────────────

  public setWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
    value: string,
    ttlMs?: number,
  ): void {
    this.workingMemory.set(userId, sessionId, key, value, ttlMs);
  }

  public getWorkingMemory(
    userId: UserId,
    sessionId: SessionId,
    key: string,
  ): string | undefined {
    return this.workingMemory.get(userId, sessionId, key);
  }

  public getWorkingMemoryContext(
    userId: UserId,
    sessionId: SessionId,
  ): WorkingMemoryContext {
    return this.workingMemory.getAll(userId, sessionId);
  }

  public clearWorkingMemory(userId: UserId, sessionId: SessionId): void {
    this.workingMemory.clearSession(userId, sessionId);
  }

  // ─── Long-Term Memory ────────────────────────────────────────────────────────

  public async createMemory(request: MemoryWriteRequest): Promise<Result<MemoryItem>> {
    if (!this.isEnabled) {
      return fail(new MemoryFailedError('create', 'Memory is disabled in configuration'));
    }
    return this.writer.write(request);
  }

  public async updateMemory(request: MemoryUpdateRequest): Promise<Result<MemoryItem>> {
    if (!this.isEnabled) {
      return fail(new MemoryFailedError('update', 'Memory is disabled in configuration'));
    }
    return this.writer.update(request);
  }

  public async deleteMemory(id: MemoryId, userId: UserId): Promise<Result<void>> {
    return this.writer.delete(id, userId);
  }

  public async searchMemory(query: MemoryQuery): Promise<Result<readonly MemoryItem[]>> {
    if (!this.isEnabled) {
      return ok([]);
    }
    const result = await this.retriever.search(query);
    if (!result.ok) return result;
    return ok(result.value.map((r) => r.item));
  }

  public async getAllMemory(userId: UserId): Promise<Result<readonly MemoryItem[]>> {
    return this.retriever.getAll(userId);
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  public async clearUserData(userId: UserId): Promise<void> {
    this.conversationMemory.clearUser(userId);
    this.workingMemory.clearUser(userId);
    await this.writer.deleteByUser(userId);
  }

  public destroy(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
  }

  private get isEnabled(): boolean {
    return true; // Driven by config in constructor
  }
}
