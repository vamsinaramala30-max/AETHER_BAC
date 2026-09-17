/**
 * AETHER AI — Conversation Memory
 * Manages recent conversation history within a session window.
 * User-scoped. Never cross-contaminates sessions or users.
 */

import type {
  ContextMessage,
  UserId,
  SessionId,
  ConversationId,
  MessageRole,
} from '../ai-types.js';
import { MEMORY } from '../ai-constants.js';
import { defaultTokenizer } from '../llm/tokenizer.js';

// ─── IConversationMemory Interface ────────────────────────────────────────────

export interface IConversationMemory {
  addMessage(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    role: MessageRole,
    content: string,
  ): ContextMessage;
  getHistory(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    maxTokens?: number,
  ): readonly ContextMessage[];
  clearSession(userId: UserId, sessionId: SessionId, conversationId: ConversationId): void;
  clearUser(userId: UserId): void;
}

// ─── In-Memory Conversation Memory ───────────────────────────────────────────

export class ConversationMemory implements IConversationMemory {
  private readonly sessions = new Map<string, ContextMessage[]>();
  private readonly windowSize: number;

  constructor(windowSize: number = MEMORY.DEFAULT_WINDOW_SIZE) {
    this.windowSize = Math.min(windowSize, MEMORY.MAX_WINDOW_SIZE);
  }

  public addMessage(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    role: MessageRole,
    content: string,
  ): ContextMessage {
    const key = this.buildKey(userId, sessionId, conversationId);
    const messages = this.sessions.get(key) ?? [];

    const message: ContextMessage = {
      role,
      content,
      timestamp: Date.now(),
      messageId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    messages.push(message);

    // Keep only the window
    if (messages.length > this.windowSize) {
      messages.splice(0, messages.length - this.windowSize);
    }

    this.sessions.set(key, messages);
    return message;
  }

  public getHistory(
    userId: UserId,
    sessionId: SessionId,
    conversationId: ConversationId,
    maxTokens?: number,
  ): readonly ContextMessage[] {
    const key = this.buildKey(userId, sessionId, conversationId);
    const messages = this.sessions.get(key) ?? [];

    if (!maxTokens) return messages;

    return defaultTokenizer.trimMessages(messages, maxTokens);
  }

  public clearSession(userId: UserId, sessionId: SessionId, conversationId: ConversationId): void {
    const key = this.buildKey(userId, sessionId, conversationId);
    this.sessions.delete(key);
  }

  public clearUser(userId: UserId): void {
    for (const key of this.sessions.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.sessions.delete(key);
      }
    }
  }

  private buildKey(userId: UserId, sessionId: SessionId, conversationId: ConversationId): string {
    return `${userId}:${sessionId}:${conversationId}`;
  }
}
