// ============================================================================
// File: backend/src/modules/projects/projects/projects.repository.ts
// ============================================================================

import { db } from '../../database/client';
import { ProjectFilterDTO } from './projects.dto';
import { ProjectEntity } from './projects.entity';
import { ProjectStatus as PrismaProjectStatus, ProjectPriority as PrismaProjectPriority } from '@prisma/client';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ProjectsRepository {
  private mapToEntity(p: any): ProjectEntity {
    return {
      id: p.id,
      ownerId: p.ownerId,
      name: p.name,
      slug: p.id,
      description: p.description || null,
      templateId: null,
      category: p.category || 'General',
      status: (p.status || 'ACTIVE') as any,
      priority: (p.priority || 'MEDIUM') as any,
      progressPercentage: p.progress ?? 0,
      startDate: p.startDate ? new Date(p.startDate) : null,
      endDate: p.endDate ? new Date(p.endDate) : null,
      dueDate: p.endDate ? new Date(p.endDate) : null,
      members: p.workspace?.members ? p.workspace.members.map((m: any) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.createdAt,
      })) : [],
      tags: p.tags || [],
      attachments: [],
      notes: [],
      isArchived: p.isArchived ?? false,
      isFavorite: p.isFavorite ?? false,
      metadata: {},
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async findById(id: string): Promise<ProjectEntity | null> {
    const project = await db.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        workspace: {
          include: {
            members: true,
          },
        },
      },
    });
    return project ? this.mapToEntity(project) : null;
  }

  async findMany(filter: ProjectFilterDTO): Promise<PaginatedResult<ProjectEntity>> {
    const where: any = { deletedAt: null };

    if (filter.ownerId) {
      where.ownerId = filter.ownerId;
    }
    if (filter.workspaceId) {
      where.workspaceId = filter.workspaceId;
    }
    if (filter.memberId) {
      where.workspace = {
        members: {
          some: { userId: filter.memberId },
        },
      };
    }
    if (filter.category) {
      where.category = { equals: filter.category, mode: 'insensitive' };
    }
    if (filter.status) {
      where.status = filter.status as PrismaProjectStatus;
    }
    if (filter.priority) {
      where.priority = filter.priority as PrismaProjectPriority;
    }
    if (filter.isArchived !== undefined) {
      where.isArchived = filter.isArchived;
    }
    if (filter.isFavorite !== undefined) {
      where.isFavorite = filter.isFavorite;
    }
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    if (filter.tags && filter.tags.length > 0) {
      where.tags = { hasSome: filter.tags };
    }

    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const skip = (page - 1) * limit;

    const sortBy = filter.sortBy || 'createdAt';
    const sortOrder = filter.sortOrder || 'desc';

    const [items, total] = await Promise.all([
      db.project.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        include: {
          workspace: {
            include: {
              members: true,
            },
          },
        },
      }),
      db.project.count({ where }),
    ]);

    return {
      data: items.map((i) => this.mapToEntity(i)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async save(project: Partial<ProjectEntity> & { name: string; ownerId: string; workspaceId?: string }): Promise<ProjectEntity> {
    let workspaceId = project.workspaceId;

    if (!workspaceId) {
      // Find default workspace for owner
      const membership = await db.workspaceMember.findFirst({
        where: { userId: project.ownerId },
      });
      if (membership) {
        workspaceId = membership.workspaceId;
      } else {
        // Create workspace for user if none exists
        const ws = await db.workspace.create({
          data: {
            name: `Personal Workspace`,
            slug: `ws-${project.ownerId.slice(0, 8)}-${Date.now().toString(36)}`,
            members: { create: { userId: project.ownerId, role: 'OWNER' } },
          },
        });
        workspaceId = ws.id;
      }
    }

    if (project.id) {
      const existing = await db.project.findUnique({ where: { id: project.id } });
      if (existing) {
        const updated = await db.project.update({
          where: { id: project.id },
          data: {
            name: project.name,
            description: project.description,
            status: project.status as any,
            priority: project.priority as any,
            category: project.category,
            tags: project.tags,
            progress: project.progressPercentage,
            isArchived: project.isArchived,
            isFavorite: project.isFavorite,
            startDate: project.startDate,
            endDate: project.endDate,
          },
          include: { workspace: { include: { members: true } } },
        });
        return this.mapToEntity(updated);
      }
    }

    const created = await db.project.create({
      data: {
        name: project.name,
        description: project.description,
        workspaceId: workspaceId!,
        ownerId: project.ownerId,
        status: (project.status as any) || 'ACTIVE',
        priority: (project.priority as any) || 'MEDIUM',
        category: project.category || 'General',
        tags: project.tags || [],
        progress: project.progressPercentage || 0,
        isArchived: project.isArchived || false,
        isFavorite: project.isFavorite || false,
        startDate: project.startDate,
        endDate: project.endDate,
      },
      include: { workspace: { include: { members: true } } },
    });

    await db.notification.create({
      data: {
        userId: project.ownerId,
        title: 'Project created',
        message: `Project "${project.name}" is now available in your workspace.`,
        type: 'PROJECT',
        metadata: { projectId: created.id },
      },
    });

    return this.mapToEntity(created);
  }

  async delete(id: string): Promise<boolean> {
    try {
      await db.project.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }

  async countByOwner(ownerId: string): Promise<number> {
    return db.project.count({
      where: { ownerId, deletedAt: null },
    });
  }
}
