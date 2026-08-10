/**
 * AETHER AI — Knowledge Manager
 * Manages knowledge collections and coordinates retrieval across collections.
 * Connects directly to Part 1 RAG Engine for query execution — does NOT duplicate RAG logic.
 */

import type { KnowledgeCollection, KnowledgeSearchOptions, KnowledgeSearchResult } from './knowledge-types.js';
import type { IRAGEngine } from '../rag/rag-engine.js';
import type { Result } from '../ai-types.js';

export interface IKnowledgeManager {
  createCollection(name: string, description?: string): Promise<KnowledgeCollection>;
  getCollection(id: string): Promise<KnowledgeCollection | undefined>;
  listCollections(): Promise<readonly KnowledgeCollection[]>;
  deleteCollection(id: string): Promise<boolean>;
  search(query: string, options?: KnowledgeSearchOptions): Promise<readonly KnowledgeSearchResult[]>;
}

export class KnowledgeManager implements IKnowledgeManager {
  private readonly collections = new Map<string, KnowledgeCollection>();

  constructor(private readonly ragEngine?: IRAGEngine) {}

  public async createCollection(name: string, description?: string): Promise<KnowledgeCollection> {
    const id = `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const collection: KnowledgeCollection = {
      id,
      name,
      description,
      documentCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.collections.set(id, collection);
    return collection;
  }

  public async getCollection(id: string): Promise<KnowledgeCollection | undefined> {
    return this.collections.get(id);
  }

  public async listCollections(): Promise<readonly KnowledgeCollection[]> {
    return Array.from(this.collections.values());
  }

  public async deleteCollection(id: string): Promise<boolean> {
    return this.collections.delete(id);
  }

  public async search(
    query: string,
    options: KnowledgeSearchOptions = {},
  ): Promise<readonly KnowledgeSearchResult[]> {
    if (!this.ragEngine) {
      return [];
    }

    const collectionIds = options.collectionId
      ? [options.collectionId]
      : options.collectionIds;

    const result = await this.ragEngine.query({
      text: query,
      topK: options.topK ?? 5,
      scoreThreshold: options.scoreThreshold ?? 0.5,
      collectionIds,
    });

    if (!result.ok) {
      return [];
    }

    return result.value.documents.map((doc) => ({
      documentId: doc.documentId,
      chunkId: doc.chunkId,
      title: doc.citation.title || 'Untitled Document',
      content: doc.content,
      score: doc.score,
      metadata: doc.metadata,
    }));
  }
}

export const knowledgeManager = new KnowledgeManager();
