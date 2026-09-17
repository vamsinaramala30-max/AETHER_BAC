/**
 * AETHER AI — Document Repository
 * Authoritative persistence layer for Knowledge Documents using Prisma (db.document)
 * with in-memory caching and fallback.
 * Strictly scope-aware, deduplication-ready, and lifecycle-managed.
 */

import type { KnowledgeDocument, KnowledgeDocumentStatus } from '../../knowledge/knowledge-types.js';
import { db } from '../../../../database/client.js';
import { toUuid } from './memory-repository.js';

export interface IDocumentRepository {
  save(doc: KnowledgeDocument): Promise<void>;
  getById(id: string): Promise<KnowledgeDocument | undefined>;
  getByHash(contentHash: string, userId?: string): Promise<KnowledgeDocument | undefined>;
  list(collectionId?: string, userId?: string): Promise<readonly KnowledgeDocument[]>;
  updateStatus(
    id: string,
    status: KnowledgeDocumentStatus,
    chunkCount?: number,
    errorMessage?: string,
  ): Promise<KnowledgeDocument | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class DocumentRepository implements IDocumentRepository {
  private readonly docs = new Map<string, KnowledgeDocument>();

  private get useDB(): boolean {
    return process.env.MEMORY_MODE !== 'in-memory' && Boolean((db as any).document);
  }

  public async save(doc: KnowledgeDocument): Promise<void> {
    this.docs.set(doc.id, doc);

    if (this.useDB) {
      try {
        const validId = toUuid(doc.id);
        const validUserId = doc.userId ? toUuid(doc.userId) : null;
        let kbId = (doc.metadata as any)?.knowledgeBaseId;
        if (!kbId) {
          const firstKb = await (db as any).knowledgeBase.findFirst();
          if (firstKb) {
            kbId = firstKb.id;
          } else {
            const firstWs = await (db as any).workspace.findFirst();
            const wsId = firstWs ? firstWs.id : toUuid('00000000-0000-0000-0000-000000000001');
            const createdKb = await (db as any).knowledgeBase.create({
              data: {
                workspaceId: wsId,
                name: 'Default Knowledge Base',
              },
            });
            kbId = createdKb.id;
          }
        }

        const payload = JSON.stringify({
          originalId: doc.id,
          collectionId: doc.collectionId,
          title: doc.title,
          filename: doc.filename,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          status: doc.status,
          chunkCount: doc.chunkCount,
          metadata: doc.metadata,
          userId: doc.userId,
          workspaceId: doc.workspaceId,
          projectId: doc.projectId,
          contentHash: doc.contentHash,
          errorMessage: doc.errorMessage,
        });

        await (db as any).document.upsert({
          where: { id: validId },
          update: {
            fileName: doc.title,
            fileUrl: doc.filename || '',
            content: payload,
            status: doc.status.toUpperCase(),
            updatedAt: new Date(doc.updatedAt),
          },
          create: {
            id: validId,
            knowledgeBaseId: kbId,
            fileName: doc.title,
            fileUrl: doc.filename || '',
            content: payload,
            status: doc.status.toUpperCase(),
            createdAt: new Date(doc.createdAt),
            updatedAt: new Date(doc.updatedAt),
          },
        });
      } catch {
        // In-memory cache is authoritative fallback
      }
    }
  }

  public async getById(id: string): Promise<KnowledgeDocument | undefined> {
    const cached = this.docs.get(id);
    if (cached) return cached;

    if (this.useDB) {
      try {
        const validId = toUuid(id);
        const record = await (db as any).document.findUnique({
          where: { id: validId },
        });
        if (record) {
          const doc = this.recordToDocument(record);
          this.docs.set(doc.id, doc);
          return doc;
        }
      } catch {
        // Fallback to cache
      }
    }

    return undefined;
  }

  public async getByHash(contentHash: string, userId?: string): Promise<KnowledgeDocument | undefined> {
    for (const doc of this.docs.values()) {
      if (doc.contentHash === contentHash) {
        if (!userId || !doc.userId || doc.userId === userId) {
          return doc;
        }
      }
    }

    if (this.useDB) {
      try {
        const records = await (db as any).document.findMany({ take: 50 });
        for (const record of records) {
          const doc = this.recordToDocument(record);
          if (doc.contentHash === contentHash && (!userId || !doc.userId || doc.userId === userId)) {
            this.docs.set(doc.id, doc);
            return doc;
          }
        }
      } catch {
        // Fallback
      }
    }

    return undefined;
  }

  public async list(collectionId?: string, userId?: string): Promise<readonly KnowledgeDocument[]> {
    const list: KnowledgeDocument[] = [];
    for (const doc of this.docs.values()) {
      if (collectionId && doc.collectionId !== collectionId) continue;
      if (userId && doc.userId && doc.userId !== userId) continue;
      list.push(doc);
    }

    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public async updateStatus(
    id: string,
    status: KnowledgeDocumentStatus,
    chunkCount?: number,
    errorMessage?: string,
  ): Promise<KnowledgeDocument | undefined> {
    const doc = await this.getById(id);
    if (!doc) return undefined;

    const updated: KnowledgeDocument = {
      ...doc,
      status,
      chunkCount: chunkCount !== undefined ? chunkCount : doc.chunkCount,
      errorMessage: errorMessage !== undefined ? errorMessage : doc.errorMessage,
      updatedAt: Date.now(),
    };

    await this.save(updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    const deletedFromCache = this.docs.delete(id);

    if (this.useDB) {
      try {
        const validId = toUuid(id);
        await (db as any).document.delete({ where: { id: validId } });
        return true;
      } catch {
        return deletedFromCache;
      }
    }

    return deletedFromCache;
  }

  public async clear(): Promise<void> {
    this.docs.clear();
  }

  private recordToDocument(record: any): KnowledgeDocument {
    try {
      if (record.content) {
        const parsed = JSON.parse(record.content);
        return {
          id: parsed.originalId || record.id,
          collectionId: parsed.collectionId || 'default',
          title: parsed.title || record.fileName || 'Untitled Document',
          filename: parsed.filename || record.fileUrl,
          mimeType: parsed.mimeType || 'text/plain',
          sizeBytes: parsed.sizeBytes ?? 0,
          status: (parsed.status || record.status?.toLowerCase() || 'pending') as KnowledgeDocumentStatus,
          chunkCount: parsed.chunkCount ?? 0,
          metadata: parsed.metadata || {},
          createdAt: record.createdAt instanceof Date ? record.createdAt.getTime() : Date.now(),
          updatedAt: record.updatedAt instanceof Date ? record.updatedAt.getTime() : Date.now(),
          errorMessage: parsed.errorMessage,
          userId: parsed.userId,
          workspaceId: parsed.workspaceId,
          projectId: parsed.projectId,
          contentHash: parsed.contentHash,
        };
      }
    } catch {
      // JSON parse fallback
    }

    return {
      id: record.id,
      collectionId: 'default',
      title: record.fileName || 'Untitled Document',
      filename: record.fileUrl,
      mimeType: 'text/plain',
      sizeBytes: 0,
      status: (record.status?.toLowerCase() || 'pending') as KnowledgeDocumentStatus,
      chunkCount: 0,
      metadata: {},
      createdAt: record.createdAt instanceof Date ? record.createdAt.getTime() : Date.now(),
      updatedAt: record.updatedAt instanceof Date ? record.updatedAt.getTime() : Date.now(),
    };
  }
}

export const documentRepository = new DocumentRepository();
