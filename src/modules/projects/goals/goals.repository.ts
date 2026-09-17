// ============================================================================
// File: backend/src/modules/projects/goals/goals.repository.ts
// ============================================================================

import { db } from '../../../database/client';
import { GoalEntity } from './goals.entity';
import { GoalFilterDTO } from './goals.dto';
import { PaginatedResult } from '../projects.repository';
import { GoalStatus as PrismaGoalStatus } from '@prisma/client';

const IS_UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const mapStatusToPrisma = (status?: string): PrismaGoalStatus => {
  if (!status) return PrismaGoalStatus.NOT_STARTED;
  const s = status.toUpperCase();
  if (s === 'PLANNED' || s === 'NOT_STARTED') return PrismaGoalStatus.NOT_STARTED;
  if (s === 'IN_PROGRESS' || s === 'IN PROGRESS') return PrismaGoalStatus.IN_PROGRESS;
  if (s === 'AT_RISK' || s === 'AT RISK') return PrismaGoalStatus.AT_RISK;
  if (s === 'COMPLETED' || s === 'ACHIEVED') return PrismaGoalStatus.COMPLETED;
  if (s === 'ARCHIVED' || s === 'CANCELLED') return PrismaGoalStatus.CANCELLED;
  return PrismaGoalStatus.NOT_STARTED;
};

const mapStatusFromPrisma = (status: PrismaGoalStatus): string => {
  switch (status) {
    case PrismaGoalStatus.NOT_STARTED:
      return 'PLANNED';
    case PrismaGoalStatus.IN_PROGRESS:
      return 'IN_PROGRESS';
    case PrismaGoalStatus.AT_RISK:
      return 'AT_RISK';
    case PrismaGoalStatus.COMPLETED:
      return 'COMPLETED';
    case PrismaGoalStatus.CANCELLED:
      return 'ARCHIVED';
    default:
      return 'PLANNED';
  }
};

export class GoalsRepository {
  private mapToEntity(g: any): GoalEntity {
    const isCompleted = g.status === 'COMPLETED' || g.progress === 100;
    return {
      id: g.id,
      userId: g.userId,
      title: g.title,
      description: g.description || null,
      type: 'OBJECTIVE' as any,
      status: mapStatusFromPrisma(g.status || PrismaGoalStatus.NOT_STARTED) as any,
      category: 'General',
      targetValue: 100,
      currentValue: g.progress || 0,
      unit: '%',
      deadline: g.targetDate ? new Date(g.targetDate) : new Date(),
      milestones: [],
      linkedProjectIds: g.projectId ? [g.projectId] : [],
      linkedTaskIds: [],
      isCompleted,
      completedAt: isCompleted ? g.updatedAt : null,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  async findById(id: string): Promise<GoalEntity | null> {
    if (!IS_UUID_REGEX.test(id)) return null;
    const goal = await db.goal.findFirst({
      where: { id, deletedAt: null },
    });
    return goal ? this.mapToEntity(goal) : null;
  }

  async findMany(filter: GoalFilterDTO): Promise<PaginatedResult<GoalEntity>> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 50));

    const where: any = { deletedAt: null };

    if (filter.userId) {
      if (!IS_UUID_REGEX.test(filter.userId)) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.userId = filter.userId;
    }
    if ((filter as any).projectId) {
      const pId = (filter as any).projectId;
      if (!IS_UUID_REGEX.test(pId)) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.projectId = pId;
    }
    if (filter.status) {
      where.status = mapStatusToPrisma(filter.status as string);
    }
    const skip = (page - 1) * limit;

    try {
      const [items, total] = await Promise.all([
        db.goal.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.goal.count({ where }),
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
    goal: Partial<GoalEntity> & {
      title: string;
      userId?: string;
      projectId?: string;
      workspaceId?: string;
    },
  ): Promise<GoalEntity> {
    let userId = goal.userId;
    if (userId && IS_UUID_REGEX.test(userId)) {
      const userExists = await db.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        try {
          await db.user.create({
            data: {
              id: userId,
              email: `user-${userId.substring(0, 8)}@aether.local`,
              fullName: 'Goal User',
            },
          });
        } catch {
          // ignore
        }
      }
    } else {
      const firstUser = await db.user.findFirst();
      userId = firstUser?.id;
    }

    if (!userId) {
      const newUser = await db.user.create({
        data: {
          email: `user-${Date.now()}@aether.local`,
          fullName: 'AETHER User',
        },
      });
      userId = newUser.id;
    }

    let workspaceId = goal.workspaceId;
    if (!workspaceId) {
      const membership = await db.workspaceMember.findFirst({ where: { userId } });
      workspaceId = membership?.workspaceId;
    }
    if (!workspaceId) {
      const firstWorkspace = await db.workspace.findFirst();
      workspaceId = firstWorkspace?.id;
    }
    if (!workspaceId) {
      const newWs = await db.workspace.create({
        data: {
          name: 'Personal Workspace',
          slug: `workspace-${Date.now()}`,
        },
      });
      workspaceId = newWs.id;
      await db.workspaceMember.create({
        data: {
          workspaceId,
          userId,
          role: 'OWNER',
        },
      });
    }

    const targetProjectId =
      goal.projectId ||
      (goal.linkedProjectIds && goal.linkedProjectIds.length > 0 ? goal.linkedProjectIds[0] : null);

    if (goal.id && IS_UUID_REGEX.test(goal.id)) {
      const existing = await db.goal.findUnique({ where: { id: goal.id } });
      if (existing) {
        const updated = await db.goal.update({
          where: { id: goal.id },
          data: {
            title: goal.title,
            description: goal.description,
            status: mapStatusToPrisma(goal.status as string),
            progress: goal.currentValue !== undefined ? goal.currentValue : existing.progress,
            targetDate: goal.deadline,
            projectId: targetProjectId || existing.projectId,
          },
        });
        return this.mapToEntity(updated);
      }
    }

    const created = await db.goal.create({
      data: {
        title: goal.title,
        description: goal.description,
        userId,
        workspaceId,
        status: mapStatusToPrisma(goal.status as string),
        progress: goal.currentValue || 0,
        targetDate: goal.deadline,
        projectId: targetProjectId,
      },
    });

    return this.mapToEntity(created);
  }

  async delete(id: string): Promise<boolean> {
    if (!IS_UUID_REGEX.test(id)) return false;
    try {
      await db.goal.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }
}
