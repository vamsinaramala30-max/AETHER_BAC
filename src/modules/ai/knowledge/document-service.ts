/**
 * AETHER AI — Document Service
 * Manages document metadata and lifecycle (pending → ingesting → indexed / failed → archived).
 * Uses DocumentRepository for persistence.
 */

import type { KnowledgeDocument, IngestionOptions } from './knowledge-types.js';
import type { IDocumentRepository } from '../storage/repositories/document-repository.js';
import { documentRepository } from '../storage/repositories/document-repository.js';

export interface IDocumentService {
  createDocument(
    title: string,
    content: string | Buffer,
    mimeType: string,
    options?: IngestionOptions,
  ): Promise<KnowledgeDocument>;

  getDocument(id: string): Promise<KnowledgeDocument | undefined>;
  listDocuments(collectionId?: string): Promise<readonly KnowledgeDocument[]>;
  updateStatus(
    id: string,
    status: KnowledgeDocument['status'],
    chunkCount?: number,
    errorMessage?: string,
  ): Promise<KnowledgeDocument | undefined>;
  deleteDocument(id: string): Promise<boolean>;
}

export class DocumentService implements IDocumentService {
  constructor(private readonly repo: IDocumentRepository = documentRepository) {}

  public async createDocument(
    title: string,
    content: string | Buffer,
    mimeType: string,
    options?: IngestionOptions,
  ): Promise<KnowledgeDocument> {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const sizeBytes = typeof content === 'string' ? Buffer.byteLength(content) : content.length;

    const doc: KnowledgeDocument = {
      id,
      collectionId: options?.collectionId ?? 'default',
      title,
      mimeType,
      sizeBytes,
      status: 'pending',
      chunkCount: 0,
      metadata: {
        title,
        collectionId: options?.collectionId ?? 'default',
        tags: options?.tags,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.save(doc);
    return doc;
  }

  public async getDocument(id: string): Promise<KnowledgeDocument | undefined> {
    return this.repo.getById(id);
  }

  public async listDocuments(collectionId?: string): Promise<readonly KnowledgeDocument[]> {
    return this.repo.list(collectionId);
  }

  public async updateStatus(
    id: string,
    status: KnowledgeDocument['status'],
    chunkCount?: number,
    errorMessage?: string,
  ): Promise<KnowledgeDocument | undefined> {
    const existing = await this.repo.getById(id);
    if (!existing) return undefined;

    const updated: KnowledgeDocument = {
      ...existing,
      status,
      chunkCount: chunkCount ?? existing.chunkCount,
      errorMessage: errorMessage ?? existing.errorMessage,
      updatedAt: Date.now(),
    };

    await this.repo.save(updated);
    return updated;
  }

  public async deleteDocument(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }
}

export const documentService = new DocumentService();
