/**
 * AETHER AI — Memory Types
 * Types specific to the memory subsystem.
 */

import type { MemoryId, UserId, MemoryItem, MemoryType, MemoryMetadata, MemoryScope, MemoryConfidence } from '../ai-types.js';

// ─── Memory Query ─────────────────────────────────────────────────────────────

export interface MemoryQuery {
  readonly userId: UserId;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly scope?: MemoryScope;
  readonly text?: string;
  readonly embedding?: readonly number[];
  readonly types?: readonly MemoryType[];
  readonly topK?: number;
  readonly scoreThreshold?: number;
  readonly includeExpired?: boolean;
}

// ─── Memory Write Request ─────────────────────────────────────────────────────

export interface MemoryWriteRequest {
  readonly userId: UserId;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly scope?: MemoryScope;
  readonly type: MemoryType;
  readonly content: string;
  readonly importance?: number;
  readonly confidence?: MemoryConfidence;
  readonly ttlMs?: number;
  readonly metadata?: MemoryMetadata;
}

// ─── Memory Update Request ────────────────────────────────────────────────────

export interface MemoryUpdateRequest {
  readonly id: MemoryId;
  readonly userId: UserId;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly content?: string;
  readonly importance?: number;
  readonly confidence?: MemoryConfidence;
  readonly metadata?: MemoryMetadata;
}

// ─── Memory Delete Request ────────────────────────────────────────────────────

export interface MemoryDeleteRequest {
  readonly id: MemoryId;
  readonly userId: UserId;
}

// ─── Memory Search Result ─────────────────────────────────────────────────────

export interface MemorySearchResult {
  readonly item: MemoryItem;
  readonly score: number;
}

// ─── IMemoryStore Interface ───────────────────────────────────────────────────

export interface IMemoryStore {
  create(item: MemoryItem): Promise<void>;
  getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined>;
  getByUser(userId: UserId, types?: readonly MemoryType[]): Promise<readonly MemoryItem[]>;
  getByScope(
    userId: UserId,
    scope?: MemoryScope,
    workspaceId?: string,
    projectId?: string,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]>;
  update(id: MemoryId, userId: UserId, patch: Partial<MemoryItem>): Promise<void>;
  delete(id: MemoryId, userId: UserId): Promise<void>;
  deleteByUser(userId: UserId): Promise<void>;
  findByContent(userId: UserId, contentQuery: string): Promise<readonly MemoryItem[]>;
  incrementAccessCount(id: MemoryId, userId: UserId): Promise<void>;
  search(
    userId: UserId,
    embedding: readonly number[],
    topK: number,
    scoreThreshold: number,
    types?: readonly MemoryType[],
    workspaceId?: string,
    projectId?: string,
  ): Promise<readonly MemorySearchResult[]>;
  count(userId: UserId): Promise<number>;
}
