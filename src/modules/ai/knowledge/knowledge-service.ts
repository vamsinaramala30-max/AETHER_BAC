/**
 * AETHER AI — Knowledge Service
 * Main service facade coordinating document management, ingestion, and search.
 * Connects Knowledge to the Part 1 RAG subsystem.
 */

import type {
  KnowledgeDocument,
  KnowledgeCollection,
  KnowledgeSearchResult,
  KnowledgeSearchOptions,
  IngestionOptions,
} from './knowledge-types.js';
import type { IDocumentService } from './document-service.js';
import { documentService } from './document-service.js';
import type { IKnowledgeManager } from './knowledge-manager.js';
import { knowledgeManager } from './knowledge-manager.js';
import type { IRAGEngine } from '../rag/rag-engine.js';
import type { Result } from '../ai-types.js';
import { fail } from '../ai-types.js';
import { RAGFailedError } from '../ai-errors.js';

export interface IKnowledgeService {
  createCollection(name: string, description?: string): Promise<KnowledgeCollection>;
  listCollections(): Promise<readonly KnowledgeCollection[]>;
  ingestDocument(
    title: string,
    content: string | Buffer,
    mimeType: string,
    options?: IngestionOptions,
  ): Promise<KnowledgeDocument>;
  searchKnowledge(
    query: string,
    options?: KnowledgeSearchOptions,
  ): Promise<readonly KnowledgeSearchResult[]>;
  deleteDocument(documentId: string): Promise<boolean>;
}

export class KnowledgeService implements IKnowledgeService {
  constructor(
    private readonly docService: IDocumentService = documentService,
    private readonly manager: IKnowledgeManager = knowledgeManager,
    private readonly ragEngine?: IRAGEngine,
  ) {}

  public async createCollection(name: string, description?: string): Promise<KnowledgeCollection> {
    return this.manager.createCollection(name, description);
  }

  public async listCollections(): Promise<readonly KnowledgeCollection[]> {
    return this.manager.listCollections();
  }

  public async ingestDocument(
    title: string,
    content: string | Buffer,
    mimeType: string,
    options?: IngestionOptions,
  ): Promise<KnowledgeDocument> {
    // 1. Create pending document record
    const doc = await this.docService.createDocument(title, content, mimeType, options);

    // 2. Delegate ingestion to Part 1 RAG engine if available
    if (this.ragEngine) {
      await this.docService.updateStatus(doc.id, 'ingesting');
      const source = Buffer.isBuffer(content)
        ? ({ type: 'buffer', content, mimeType, filename: title, metadata: doc.metadata } as const)
        : ({
            type: 'text',
            content: String(content),
            filename: title,
            metadata: doc.metadata,
          } as const);
      const ingestResult = await this.ragEngine.ingest(source, options?.collectionId);

      if (ingestResult.ok) {
        const updated = await this.docService.updateStatus(
          doc.id,
          'indexed',
          ingestResult.value.totalChunks,
        );
        return updated ?? doc;
      } else {
        const updated = await this.docService.updateStatus(
          doc.id,
          'failed',
          0,
          ingestResult.error.message,
        );
        return updated ?? doc;
      }
    }

    // RAG engine unavailable -> document remains in pending state
    return doc;
  }

  public async searchKnowledge(
    query: string,
    options?: KnowledgeSearchOptions,
  ): Promise<readonly KnowledgeSearchResult[]> {
    return this.manager.search(query, options);
  }

  public async deleteDocument(documentId: string): Promise<boolean> {
    if (this.ragEngine) {
      await this.ragEngine.deleteDocument(documentId);
    }
    return this.docService.deleteDocument(documentId);
  }
}

export const knowledgeService = new KnowledgeService();
