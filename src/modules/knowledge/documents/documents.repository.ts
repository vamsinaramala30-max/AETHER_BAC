import { db } from '../../../database/client';
import { DocumentEntity, DocumentVersion } from './documents.entity';
import { QueryDocumentsDto } from './documents.dto';
import { DocumentStatus } from '../knowledge.constants';

const isValidUuid = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

async function getOrCreateKnowledgeBaseId(): Promise<string> {
  let kb = await db.knowledgeBase.findFirst();
  if (!kb) {
    let ws = await db.workspace.findFirst();
    if (!ws) {
      ws = await db.workspace.create({
        data: {
          name: 'Default Workspace',
          slug: 'default-workspace',
        },
      });
    }
    kb = await db.knowledgeBase.create({
      data: {
        workspaceId: ws.id,
        name: 'Default Knowledge Base',
      },
    });
  }
  return kb.id;
}

export class DocumentsRepository {
  async create(
    doc: Omit<DocumentEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<DocumentEntity> {
    const kbId = await getOrCreateKnowledgeBaseId();

    const payload = JSON.stringify({
      title: doc.title,
      description: doc.description || '',
      category: doc.category || 'Reports',
      tags: doc.tags || [],
      attachedFileIds: (doc.metadata as any)?.attachedFileIds || [],
      ownerId: doc.ownerId,
      metadata: doc.metadata || {},
    });

    const created = await db.document.create({
      data: {
        knowledgeBaseId: kbId,
        fileName: doc.title,
        fileUrl: doc.fileKey || '',
        content: payload,
        status: doc.status || 'READY',
      },
    });

    return {
      id: created.id,
      title: doc.title,
      description: doc.description,
      status: created.status as DocumentStatus,
      category: doc.category || 'Reports',
      tags: doc.tags || [],
      fileKey: created.fileUrl || '',
      metadata: doc.metadata,
      ownerId: doc.ownerId,
      sharedUserIds: [],
      permissions: { canRead: [], canWrite: [] },
      version: 1,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    if (!isValidUuid(id)) return null;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return null;

    let parsed: any = {};
    try {
      if (doc.content) parsed = JSON.parse(doc.content);
    } catch {}

    return {
      id: doc.id,
      title: doc.fileName || parsed.title || 'Untitled Document',
      description: parsed.description || '',
      status: (doc.status as DocumentStatus) || DocumentStatus.PUBLISHED,
      category: parsed.category || 'Reports',
      tags: parsed.tags || [],
      fileKey: doc.fileUrl || '',
      metadata: parsed.metadata || {
        fileSize: 0,
        mimeType: 'application/pdf',
        originalName: doc.fileName || '',
      },
      ownerId: parsed.ownerId || '',
      sharedUserIds: [],
      permissions: { canRead: [], canWrite: [] },
      version: 1,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async update(id: string, updates: Partial<DocumentEntity>): Promise<DocumentEntity | null> {
    if (!isValidUuid(id)) return null;
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };

    const payload = JSON.stringify({
      title: merged.title,
      description: merged.description,
      category: merged.category,
      tags: merged.tags,
      attachedFileIds: (merged.metadata as any)?.attachedFileIds || [],
      ownerId: merged.ownerId,
      metadata: merged.metadata,
    });

    const updated = await db.document.update({
      where: { id },
      data: {
        fileName: merged.title,
        fileUrl: merged.fileKey,
        content: payload,
        status: merged.status,
      },
    });

    return {
      ...merged,
      updatedAt: updated.updatedAt,
    };
  }

  async delete(id: string): Promise<boolean> {
    if (!isValidUuid(id)) return true;
    try {
      await db.document.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async findAll(
    query: QueryDocumentsDto,
    userId: string,
  ): Promise<{ data: DocumentEntity[]; total: number }> {
    try {
      const page = Math.max(1, query.page || 1);
      const limit = Math.max(1, query.limit || 50);

      const [docs, total] = await Promise.all([
        db.document.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: (page - 1) * limit,
        }),
        db.document.count(),
      ]);

      const data: DocumentEntity[] = docs.map((doc) => {
        let parsed: any = {};
        try {
          if (doc.content) parsed = JSON.parse(doc.content);
        } catch {}
        return {
          id: doc.id,
          title: doc.fileName || parsed.title || 'Untitled Document',
          description: parsed.description || '',
          status: (doc.status as DocumentStatus) || DocumentStatus.PUBLISHED,
          category: parsed.category || 'Reports',
          tags: parsed.tags || [],
          fileKey: doc.fileUrl || '',
          metadata: parsed.metadata || {
            fileSize: 0,
            mimeType: 'application/pdf',
            originalName: doc.fileName || '',
          },
          ownerId: parsed.ownerId || userId,
          sharedUserIds: [],
          permissions: { canRead: [], canWrite: [] },
          version: 1,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      });

      let filtered = data;
      if (query.category && query.category !== 'All Documents') {
        filtered = filtered.filter(
          (d) => d.category.toLowerCase() === query.category!.toLowerCase(),
        );
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        filtered = filtered.filter(
          (d) => d.title.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q),
        );
      }

      return { data: filtered, total: filtered.length };
    } catch {
      return { data: [], total: 0 };
    }
  }
}
