/**
 * AETHER AI — Knowledge Types
 * Strict type definitions for knowledge collections, document management,
 * document lifecycle, and retrieval coordination.
 */

import type { DocumentMetadata } from '../ai-types.js';

export interface KnowledgeCollection {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly documentCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly metadata?: DocumentMetadata;
}

export type KnowledgeDocumentStatus = 'pending' | 'ingesting' | 'indexed' | 'failed' | 'archived';

export interface KnowledgeDocument {
  readonly id: string;
  readonly collectionId: string;
  readonly title: string;
  readonly filename?: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: KnowledgeDocumentStatus;
  readonly chunkCount: number;
  readonly metadata: DocumentMetadata;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly errorMessage?: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly contentHash?: string;
}

export interface IngestionOptions {
  readonly collectionId?: string;
  readonly chunkSize?: number;
  readonly chunkOverlap?: number;
  readonly tags?: readonly string[];
}

export interface KnowledgeSearchOptions {
  readonly collectionId?: string;
  readonly collectionIds?: readonly string[];
  readonly topK?: number;
  readonly scoreThreshold?: number;
}

export interface KnowledgeSearchResult {
  readonly documentId: string;
  readonly chunkId: string;
  readonly title: string;
  readonly content: string;
  readonly score: number;
  readonly metadata: DocumentMetadata;
}
