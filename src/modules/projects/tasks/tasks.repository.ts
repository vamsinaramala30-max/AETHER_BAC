// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.repository.ts
// ============================================================================

import { db } from '../../../database/client';
import { TaskEntity } from './tasks.entity';
import { TaskFilterDTO } from './tasks.dto';
import { PaginatedResult } from '../projects.repository';
import { TaskStatus as PrismaTaskStatus, TaskPriority as PrismaTaskPriority } from '@prisma/client';

export class TasksRepository {
  private mapToEntity(t: any): TaskEntity {
    const isCompleted = t.status === 'DONE' || !!t.completedAt;
    return {
      id: t.id,
      projectId: t.projectId,
      workspaceId: t.workspaceId,
      creatorId: t.creatorId,
      listId: null,
      parentTaskId: t.parentTaskId || null,
      title: t.title,
      description: t.description || null,
      status: (t.status || 'TODO') as any,
      priority: (t.priority || 'MEDIUM') as any,
      assigneeIds: t.assigneeId ? [t.assigneeId] : [],
      dependencyTaskIds: [],
      dueDate: t.dueDate ? new Date(t.dueDate) : null,
      estimatedMinutes: t.estimatedHours ? Math.round(t.estimatedHours * 60) : null,
      loggedMinutes: 0,
      recurrence: t.recurringRule ? ('WEEKLY' as any) : ('NONE' as any),
      labels: t.labels || [],
      checklists: [],
      comments: t.comments
        ? t.comments.map((c: any) => ({
            id: c.id,
            authorId: c.userId,
            content: c.content,
            createdAt: c.createdAt,
          }))
        : [],
      isCompleted,
      completedAt: t.completedAt ? new Date(t.completedAt) : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async findById(id: string): Promise<TaskEntity | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !isUuid.test(id)) {
      return null;
    }
    try {
      const task = await db.task.findFirst({
        where: { id, deletedAt: null },
        include: {
          comments: true,
        },
      });
      return task ? this.mapToEntity(task) : null;
    } catch {
      return null;
    }
  }

  async findMany(filter: TaskFilterDTO): Promise<PaginatedResult<TaskEntity>> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const where: any = { deletedAt: null };

    if (filter.projectId && isUuid.test(filter.projectId)) {
      where.projectId = filter.projectId;
    }
    if (filter.status) {
      where.status = filter.status as PrismaTaskStatus;
    }
    if (filter.priority) {
      where.priority = filter.priority as PrismaTaskPriority;
    }
    if (filter.assigneeId && isUuid.test(filter.assigneeId)) {
      where.assigneeId = filter.assigneeId;
    }
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const skip = (page - 1) * limit;

    try {
      const [items, total] = await Promise.all([
        db.task.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            comments: true,
          },
        }),
        db.task.count({ where }),
      ]);

      return {
        data: items.map((i) => this.mapToEntity(i)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch {
      return {
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }

  async save(
    task: Partial<TaskEntity> & { title: string; projectId?: string; creatorId?: string },
  ): Promise<TaskEntity> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let projectId = task.projectId;
    let creatorId = task.creatorId;

    if (creatorId && isUuid.test(creatorId)) {
      const userExists = await db.user.findUnique({ where: { id: creatorId } });
      if (!userExists) {
        try {
          await db.user.create({
            data: {
              id: creatorId,
              email: `user-${creatorId.substring(0, 8)}@aether.local`,
              fullName: 'Aether User',
            },
          });
        } catch {
          // ignore
        }
      }
    } else {
      const firstUser = await db.user.findFirst();
      creatorId = firstUser?.id || '00000000-0000-0000-0000-000000000000';
    }

    if (!projectId || !isUuid.test(projectId)) {
      // Find a project or create a fallback project
      const firstProj = await db.project.findFirst({ where: { deletedAt: null } });
      if (firstProj) {
        projectId = firstProj.id;
      } else {
        const ownerId = creatorId;
        let wsMember = await db.workspaceMember.findFirst({ where: { userId: ownerId } });
        let wsId = wsMember?.workspaceId;
        if (!wsId) {
          const ws = await db.workspace.create({
            data: {
              name: 'Personal Workspace',
              slug: `ws-${Date.now().toString(36)}`,
              members: { create: { userId: ownerId, role: 'OWNER' } },
            },
          });
          wsId = ws.id;
        }
        const newProj = await db.project.create({
          data: {
            name: 'General Tasks Project',
            ownerId,
            workspaceId: wsId,
            category: 'General',
          },
        });
        projectId = newProj.id;
      }
    }

    const proj = await db.project.findUnique({ where: { id: projectId } });
    const workspaceId = proj?.workspaceId || '00000000-0000-0000-0000-000000000000';

    if (task.id && isUuid.test(task.id)) {
      const existing = await db.task.findUnique({ where: { id: task.id } });
      if (existing) {
        let updateAssigneeId: string | undefined;
        if (task.assigneeIds && task.assigneeIds.length > 0 && isUuid.test(task.assigneeIds[0]!)) {
          const aId = task.assigneeIds[0]!;
          const aUser = await db.user.findUnique({ where: { id: aId } });
          if (!aUser) {
            try {
              await db.user.create({
                data: {
                  id: aId,
                  email: `user-${aId.substring(0, 8)}@aether.local`,
                  fullName: 'Assignee User',
                },
              });
              updateAssigneeId = aId;
            } catch {
              // ignore
            }
          } else {
            updateAssigneeId = aId;
          }
        }

        const updated = await db.task.update({
          where: { id: task.id },
          data: {
            title: task.title,
            description: task.description,
            status: task.status as any,
            priority: task.priority as any,
            dueDate: task.dueDate,
            assigneeId: updateAssigneeId,
            labels: task.labels,
            estimatedHours: task.estimatedMinutes ? task.estimatedMinutes / 60 : undefined,
            completedAt: task.isCompleted || task.status === 'DONE' ? new Date() : null,
          },
          include: { comments: true },
        });
        return this.mapToEntity(updated);
      }
    }

    let assigneeId: string | null = null;
    if (task.assigneeIds && task.assigneeIds.length > 0 && isUuid.test(task.assigneeIds[0]!)) {
      const aId = task.assigneeIds[0]!;
      const aUser = await db.user.findUnique({ where: { id: aId } });
      if (!aUser) {
        try {
          await db.user.create({
            data: {
              id: aId,
              email: `user-${aId.substring(0, 8)}@aether.local`,
              fullName: 'Assignee User',
            },
          });
          assigneeId = aId;
        } catch {
          // ignore
        }
      } else {
        assigneeId = aId;
      }
    }

    const created = await db.task.create({
      data: {
        title: task.title,
        description: task.description,
        projectId,
        workspaceId,
        creatorId,
        assigneeId,
        status: (task.status as any) || 'TODO',
        priority: (task.priority as any) || 'MEDIUM',
        dueDate: task.dueDate,
        labels: task.labels || [],
        estimatedHours: task.estimatedMinutes ? task.estimatedMinutes / 60 : null,
      },
      include: {
        comments: true,
      },
    });

    return this.mapToEntity(created);
  }

  async delete(id: string): Promise<boolean> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !isUuid.test(id)) {
      return false;
    }
    try {
      await db.task.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }

  async deleteMany(ids: string[]): Promise<number> {
    const res = await db.task.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    return res.count;
  }
}
