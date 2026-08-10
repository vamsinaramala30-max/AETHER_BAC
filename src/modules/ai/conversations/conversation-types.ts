/**
 * AETHER AI — Conversation Types
 * Types for multi-turn user-scoped conversations and structured messages.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ConversationMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: Role;
  readonly content: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly createdAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Conversation {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly messageCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateConversationRequest {
  readonly userId: string;
  readonly title?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UpdateConversationRequest {
  readonly conversationId: string;
  readonly userId: string;
  readonly title?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AddMessageRequest {
  readonly conversationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly content: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SendMessageOptions {
  readonly modelId?: string;
  readonly enableMemory?: boolean;
  readonly enableRAG?: boolean;
  readonly ragCollectionIds?: readonly string[];
  readonly signal?: AbortSignal;
}
