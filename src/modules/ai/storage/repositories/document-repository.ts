/**
 * AETHER AI — Document Repository
 * Persistence layer for Knowledge Documents. Pure persistence only — no business logic.
 */

import type { KnowledgeDocument } from '../../knowledge/knowledge-types.js';

export interface IDocumentRepository {
  save(doc: KnowledgeDocument): Promise<void>;
  getById(id: string): Promise<KnowledgeDocument | undefined>;
  list(collectionId?: string): Promise<readonly KnowledgeDocument[]>;
  delete(id: string): Promise<boolean>;
}

export class DocumentRepository implements IDocumentRepository {
  private readonly docs = new Map<string, KnowledgeDocument>();

  public async save(doc: KnowledgeDocument): Promise<void> {
    this.docs.set(doc.id, doc);
  }

  public async getById(id: string): Promise<KnowledgeDocument | undefined> {
    return this.docs.get(id);
  }

  public async list(collectionId?: string): Promise<readonly KnowledgeDocument[]> {
    const list: KnowledgeDocument[] = [];
    for (const doc of this.docs.values()) {
      if (!collectionId || doc.collectionId === collectionId) {
        list.push(doc);
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public async delete(id: string): Promise<boolean> {
    return this.docs.delete(id);
  }
}

export const documentRepository = new DocumentRepository();
