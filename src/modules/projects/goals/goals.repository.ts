// ============================================================================
// File: backend/src/modules/projects/goals/goals.repository.ts
// ============================================================================

import { db } from '../../../database/client';
import { GoalEntity } from './goals.entity';
import { GoalFilterDTO } from './goals.dto';
import { PaginatedResult } from '../projects.repository';
import { GoalStatus as PrismaGoalStatus } from '@prisma/client';

export class GoalsRepository {
  private mapToEntity(g: any): GoalEntity {
    const isCompleted = g.status === 'COMPLETED' || g.progress === 100;
    return {
      id: g.id,
      userId: g.userId,
      title: g.title,
      description: g.description || null,
      type: 'OBJECTIVE' as any,
      status: (g.status || 'IN_PROGRESS') as any,
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
    const goal = await db.goal.findFirst({
      where: { id, deletedAt: null },
    });
    return goal ? this.mapToEntity(goal) : null;
  }

  async findMany(filter: GoalFilterDTO): Promise<PaginatedResult<GoalEntity>> {
    const where: any = { deletedAt: null };

    if (filter.userId) {
      where.userId = filter.userId;
    }
    if (filter.status) {
      where.status = filter.status as PrismaGoalStatus;
    }

    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const skip = (page - 1) * limit;

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
  }

  async save(goal: Partial<GoalEntity> & { title: string; userId?: string }): Promise<GoalEntity> {
    let userId = goal.userId;
    if (!userId) {
      const firstUser = await db.user.findFirst();
      userId = firstUser?.id || '00000000-0000-0000-0000-000000000000';
    }

    // Get user's workspace
    const membership = await db.workspaceMember.findFirst({ where: { userId } });
    const workspaceId = membership?.workspaceId || '00000000-0000-0000-0000-000000000000';

    if (goal.id) {
      const existing = await db.goal.findUnique({ where: { id: goal.id } });
      if (existing) {
        const updated = await db.goal.update({
          where: { id: goal.id },
          data: {
            title: goal.title,
            description: goal.description,
            status: goal.status as any,
            progress: goal.currentValue,
            targetDate: goal.deadline,
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
        status: (goal.status as any) || 'IN_PROGRESS',
        progress: goal.currentValue || 0,
        targetDate: goal.deadline,
        projectId: goal.linkedProjectIds && goal.linkedProjectIds.length > 0 ? goal.linkedProjectIds[0] : null,
      },
    });

    return this.mapToEntity(created);
  }

  async delete(id: string): Promise<boolean> {
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
