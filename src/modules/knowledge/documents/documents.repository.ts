import { DocumentEntity, DocumentVersion } from './documents.entity';
import { QueryDocumentsDto } from './documents.dto';

export class DocumentsRepository {
  private documentsMap = new Map<string, DocumentEntity>();
  private versionsMap = new Map<string, DocumentVersion[]>();

  async create(
    doc: Omit<DocumentEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<DocumentEntity> {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const newDoc: DocumentEntity = {
      ...doc,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.documentsMap.set(id, newDoc);
    return newDoc;
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    return this.documentsMap.get(id) || null;
  }

  async update(id: string, updates: Partial<DocumentEntity>): Promise<DocumentEntity | null> {
    const existing = this.documentsMap.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      version: updates.fileKey ? existing.version + 1 : existing.version,
      updatedAt: new Date(),
    };

    this.documentsMap.set(id, updated);
    return updated;
  }

  async findAll(
    query: QueryDocumentsDto,
    userId: string,
  ): Promise<{ data: DocumentEntity[]; total: number }> {
    let results = Array.from(this.documentsMap.values()).filter(
      (d) => d.ownerId === userId || d.permissions.canRead.includes(userId),
    );

    if (query.category) results = results.filter((d) => d.category === query.category);
    if (query.status) results = results.filter((d) => d.status === query.status);
    if (query.search) {
      const q = query.search.toLowerCase();
      results = results.filter(
        (d) => d.title.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q),
      );
    }

    const total = results.length;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const paginated = results.slice((page - 1) * limit, page * limit);

    return { data: paginated, total };
  }
}
