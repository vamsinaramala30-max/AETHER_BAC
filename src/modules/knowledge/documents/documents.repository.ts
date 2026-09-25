import { db } from '../../../database/client';
import { DocumentEntity, DocumentVersion } from './documents.entity';
import { QueryDocumentsDto } from './documents.dto';
import { DocumentStatus } from '../knowledge.constants';

const isValidUuid = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

async function getOrCreateKnowledgeBaseId(workspaceId?: string, userId?: string): Promise<string> {
  let targetWorkspaceId = workspaceId;
  if (!targetWorkspaceId && userId) {
    const member = await db.workspaceMember.findFirst({
      where: { userId },
      select: { workspaceId: true },
    });
    if (member) {
      targetWorkspaceId = member.workspaceId;
    }
  }

  if (targetWorkspaceId) {
    let kb = await db.knowledgeBase.findFirst({
      where: { workspaceId: targetWorkspaceId },
    });
    if (!kb) {
      kb = await db.knowledgeBase.create({
        data: {
          workspaceId: targetWorkspaceId,
          name: 'Workspace Knowledge Base',
        },
      });
    }
    return kb.id;
  }

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
    workspaceId?: string,
  ): Promise<DocumentEntity> {
    const kbId = await getOrCreateKnowledgeBaseId(workspaceId, doc.ownerId);

    const docWorkspaceId = workspaceId || (doc.metadata as any)?.workspaceId;
    const payload = JSON.stringify({
      title: doc.title,
      description: doc.description || '',
      category: doc.category || 'Reports',
      tags: doc.tags || [],
      attachedFileIds: (doc.metadata as any)?.attachedFileIds || [],
      ownerId: doc.ownerId,
      workspaceId: docWorkspaceId,
      permissions: doc.permissions || {
        canRead: [doc.ownerId],
        canWrite: [doc.ownerId],
      },
      metadata: {
        ...doc.metadata,
        workspaceId: docWorkspaceId,
      },
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
      metadata: {
        ...doc.metadata,
        workspaceId: docWorkspaceId,
      },
      ownerId: doc.ownerId,
      sharedUserIds: [],
      permissions: doc.permissions || { canRead: [doc.ownerId], canWrite: [doc.ownerId] },
      version: 1,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    if (!isValidUuid(id)) return null;
    const doc = await db.document.findUnique({
      where: { id },
      include: { knowledgeBase: true },
    });
    if (!doc) return null;

    let parsed: any = {};
    try {
      if (doc.content) parsed = JSON.parse(doc.content);
    } catch {}

    const docWorkspaceId =
      parsed.workspaceId || parsed.metadata?.workspaceId || doc.knowledgeBase?.workspaceId;

    return {
      id: doc.id,
      title: doc.fileName || parsed.title || 'Untitled Document',
      description: parsed.description || '',
      status: (doc.status as DocumentStatus) || DocumentStatus.PUBLISHED,
      category: parsed.category || 'Reports',
      tags: parsed.tags || [],
      fileKey: doc.fileUrl || '',
      metadata: {
        fileSize: parsed.metadata?.fileSize || 0,
        mimeType: parsed.metadata?.mimeType || 'application/pdf',
        originalName: parsed.metadata?.originalName || doc.fileName || '',
        workspaceId: docWorkspaceId,
        ...parsed.metadata,
      },
      ownerId: parsed.ownerId || '',
      sharedUserIds: parsed.sharedUserIds || [],
      permissions: parsed.permissions || {
        canRead: parsed.ownerId ? [parsed.ownerId] : [],
        canWrite: parsed.ownerId ? [parsed.ownerId] : [],
      },
      version: 1,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async update(
    id: string,
    updates: Partial<DocumentEntity>,
    workspaceId?: string,
  ): Promise<DocumentEntity | null> {
    if (!isValidUuid(id)) return null;
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };
    const docWorkspaceId =
      workspaceId || (merged.metadata as any)?.workspaceId || (existing.metadata as any)?.workspaceId;

    const payload = JSON.stringify({
      title: merged.title,
      description: merged.description,
      category: merged.category,
      tags: merged.tags,
      attachedFileIds: (merged.metadata as any)?.attachedFileIds || [],
      ownerId: merged.ownerId,
      workspaceId: docWorkspaceId,
      permissions: merged.permissions,
      metadata: {
        ...merged.metadata,
        workspaceId: docWorkspaceId,
      },
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
      metadata: {
        ...merged.metadata,
        workspaceId: docWorkspaceId,
      },
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
      if (!userId) {
        return { data: [], total: 0 };
      }

      // Find all workspaces where user is a member
      const memberships = await db.workspaceMember.findMany({
        where: { userId },
        select: { workspaceId: true },
      });
      const userWorkspaceIds = memberships.map((m) => m.workspaceId);

      // If a specific workspace is requested, verify user belongs to it
      if (query.workspaceId && !userWorkspaceIds.includes(query.workspaceId)) {
        return { data: [], total: 0 };
      }

      const targetWorkspaceIds = query.workspaceId ? [query.workspaceId] : userWorkspaceIds;

      const page = Math.max(1, query.page || 1);
      const limit = Math.max(1, query.limit || 50);

      // Build safe scoped query: documents belonging to user's knowledge base or owned by user
      const whereCondition: any = {
        OR: [
          ...(targetWorkspaceIds.length > 0
            ? [
                {
                  knowledgeBase: {
                    workspaceId: { in: targetWorkspaceIds },
                  },
                },
              ]
            : []),
          {
            content: {
              contains: `"ownerId":"${userId}"`,
            },
          },
        ],
      };

      const [docs, total] = await Promise.all([
        db.document.findMany({
          where: whereCondition,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: (page - 1) * limit,
          include: { knowledgeBase: true },
        }),
        db.document.count({ where: whereCondition }),
      ]);

      const data: DocumentEntity[] = docs.map((doc) => {
        let parsed: any = {};
        try {
          if (doc.content) parsed = JSON.parse(doc.content);
        } catch {}

        const docWorkspaceId =
          parsed.workspaceId || parsed.metadata?.workspaceId || doc.knowledgeBase?.workspaceId;

        return {
          id: doc.id,
          title: doc.fileName || parsed.title || 'Untitled Document',
          description: parsed.description || '',
          status: (doc.status as DocumentStatus) || DocumentStatus.PUBLISHED,
          category: parsed.category || 'Reports',
          tags: parsed.tags || [],
          fileKey: doc.fileUrl || '',
          metadata: {
            fileSize: parsed.metadata?.fileSize || 0,
            mimeType: parsed.metadata?.mimeType || 'application/pdf',
            originalName: parsed.metadata?.originalName || doc.fileName || '',
            workspaceId: docWorkspaceId,
            ...parsed.metadata,
          },
          ownerId: parsed.ownerId || userId,
          sharedUserIds: parsed.sharedUserIds || [],
          permissions: parsed.permissions || {
            canRead: parsed.ownerId ? [parsed.ownerId] : [userId],
            canWrite: parsed.ownerId ? [parsed.ownerId] : [userId],
          },
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

      return { data: filtered, total };
    } catch {
      return { data: [], total: 0 };
    }
  }
}
