import { db } from '../../../database/client';
import { AppError } from '../../../middleware/error.middleware';
import { emitToWorkspace, emitToUser } from '../../../websocket/socket';
import { SocketEvent } from '../../../websocket/socketTypes';
import { TaskStatus } from '../../projects/projects.constants';
import crypto from 'node:crypto';

export const isUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val));

function toUuid(id: string): string {
  if (isUuid(id)) return id;
  const hash = crypto.createHash('md5').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface PlannerBlockDTO {
  id: string;
  start: number;
  duration: number;
  label: string;
  bucket: 'study' | 'other';
  kind: 'fixed' | 'flexible';
  subject: string | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | null;
  energy: 'high' | 'medium' | 'low' | null;
  revision: { stage: 1 | 4 | 7 } | null;
  groupId: string | null;
  completed: boolean;
  taskId?: string | null;
  taskTitle?: string | null;
  taskStatus?: string | null;
  calendarEventId?: string | null;
  workspaceId?: string | null;
  dayKey?: string;
}

export interface DayData {
  sleepStart?: number;
  sleepEnd?: number;
  blocks: PlannerBlockDTO[];
}

export type DaysData = Record<string, DayData>;

export class PlannerService {
  private formatBlock(b: any): PlannerBlockDTO {
    return {
      id: b.id,
      start: typeof b.start === 'number' ? b.start : 0,
      duration: typeof b.duration === 'number' ? b.duration : 30,
      label: b.title,
      bucket: (b.bucket || 'other') as 'study' | 'other',
      kind: (b.kind || 'flexible') as 'fixed' | 'flexible',
      subject: b.subject || null,
      priority: (b.priority || null) as any,
      energy: (b.energy || null) as any,
      revision: b.revision || null,
      groupId: b.groupId || null,
      completed: Boolean(b.completed),
      taskId: b.taskId || null,
      taskTitle: b.task?.title || null,
      taskStatus: b.task?.status || null,
      calendarEventId: b.calendarEventId || null,
      workspaceId: b.workspaceId || null,
      dayKey: b.dayKey,
    };
  }

  public async validateTaskAssociation(userId: string, taskId: string): Promise<any> {
    if (!isUuid(taskId)) {
      throw new AppError('Invalid taskId format', 400, 'INVALID_TASK_ID');
    }
    const task =
      (await db.task.findFirst({
        where: { id: taskId, deletedAt: null },
      })) ||
      (await db.task.findUnique({
        where: { id: taskId },
      }));
    if (!task || task.deletedAt) {
      throw new AppError(`Task ${taskId} not found`, 404, 'TASK_NOT_FOUND');
    }

    const isOwnerOrAssignee = task.creatorId === userId || task.assigneeId === userId;
    if (!isOwnerOrAssignee) {
      const membership = await db.workspaceMember.findFirst({
        where: { workspaceId: task.workspaceId, userId },
      });
      if (!membership) {
        throw new AppError('Forbidden: you do not have permission to associate this task', 403, 'FORBIDDEN');
      }
    }

    return task;
  }

  public async getPlanner(userId: string): Promise<{ daysData: DaysData; updatedAt: string | null }> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    // 1. Fetch relational blocks from planner_blocks
    const blocks = await db.plannerBlock.findMany({
      where: { userId },
      include: {
        task: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
      orderBy: [{ dayKey: 'asc' }, { start: 'asc' }],
    });

    // 2. Fetch sleep preferences from userSettings
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });
    const displayPrefs = (settings?.displayPreferences as Record<string, any>) || {};
    const sleepSettings = displayPrefs.plannerSleepSettings || {};

    const daysData: DaysData = {};
    for (const b of blocks) {
      if (!daysData[b.dayKey]) {
        daysData[b.dayKey] = {
          sleepStart: sleepSettings[b.dayKey]?.sleepStart ?? 23,
          sleepEnd: sleepSettings[b.dayKey]?.sleepEnd ?? 7,
          blocks: [],
        };
      }
      daysData[b.dayKey]!.blocks.push(this.formatBlock(b));
    }

    // Also include any days defined in sleepSettings that have no blocks
    for (const [dayKey, sleep] of Object.entries(sleepSettings)) {
      if (!daysData[dayKey]) {
        daysData[dayKey] = {
          sleepStart: (sleep as any)?.sleepStart ?? 23,
          sleepEnd: (sleep as any)?.sleepEnd ?? 7,
          blocks: [],
        };
      }
    }

    return {
      daysData,
      updatedAt: settings?.updatedAt ? settings.updatedAt.toISOString() : null,
    };
  }

  public async getWeek(userId: string, start?: string): Promise<{ daysData: DaysData; updatedAt: string | null }> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    const { daysData, updatedAt } = await this.getPlanner(userId);
    if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
      const filteredDays: DaysData = {};
      const startDate = new Date(start);
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        filteredDays[key] = daysData[key] || { sleepStart: 23, sleepEnd: 7, blocks: [] };
      }
      return { daysData: filteredDays, updatedAt };
    }

    return { daysData, updatedAt };
  }

  public async savePlanner(userId: string, incomingDays: DaysData): Promise<{ daysData: DaysData; updatedAt: string }> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(`User ${userId} not found`, 404, 'USER_NOT_FOUND');
    }

    const dayKeys = Object.keys(incomingDays);
    const now = new Date();
    const sleepSettings: Record<string, { sleepStart?: number; sleepEnd?: number }> = {};

    await db.$transaction(async (tx) => {
      // Replace blocks for the incoming day keys
      if (dayKeys.length > 0) {
        await tx.plannerBlock.deleteMany({
          where: {
            userId,
            dayKey: { in: dayKeys },
          },
        });
      }

      for (const dayKey of dayKeys) {
        const dayData = incomingDays[dayKey];
        if (!dayData) continue;

        sleepSettings[dayKey] = {
          sleepStart: dayData.sleepStart,
          sleepEnd: dayData.sleepEnd,
        };

        if (Array.isArray(dayData.blocks)) {
          for (let i = 0; i < dayData.blocks.length; i++) {
            const b = dayData.blocks[i];
            if (!b) continue;

            const blockId = isUuid(b.id) ? b.id : toUuid(`planner_${userId}_${dayKey}_${b.id || i}`);

            let validTaskId: string | null = null;
            if (b.taskId && isUuid(b.taskId)) {
              const task = await tx.task.findUnique({ where: { id: b.taskId } });
              if (task) validTaskId = task.id;
            }

            let validCalendarEventId: string | null = null;
            if (b.calendarEventId && isUuid(b.calendarEventId)) {
              const ce = await tx.calendarEvent.findUnique({ where: { id: b.calendarEventId } });
              if (ce) validCalendarEventId = ce.id;
            }

            await tx.plannerBlock.create({
              data: {
                id: blockId,
                userId,
                dayKey,
                title: b.label || 'Untitled Block',
                start: typeof b.start === 'number' ? b.start : 0,
                duration: typeof b.duration === 'number' ? b.duration : 30,
                bucket: b.bucket || 'other',
                kind: b.kind || 'flexible',
                subject: b.subject || null,
                priority: b.priority || null,
                energy: b.energy || null,
                revision: b.revision || undefined,
                groupId: b.groupId || null,
                completed: Boolean(b.completed),
                position: i,
                taskId: validTaskId,
                calendarEventId: validCalendarEventId,
              },
            });
          }
        }
      }

      // Update userSettings with sleep preferences and legacy weeklyPlanner sync
      const settings = await tx.userSettings.findUnique({ where: { userId } });
      const currentPrefs = (settings?.displayPreferences as Record<string, any>) || {};
      const updatedPrefs = {
        ...currentPrefs,
        plannerSleepSettings: {
          ...(currentPrefs.plannerSleepSettings || {}),
          ...sleepSettings,
        },
        weeklyPlanner: {
          daysData: incomingDays,
          updatedAt: now.toISOString(),
        },
      };

      await tx.userSettings.upsert({
        where: { userId },
        create: {
          userId,
          displayPreferences: updatedPrefs as any,
        },
        update: {
          displayPreferences: updatedPrefs as any,
        },
      });
    });

    emitToUser(userId, SocketEvent.PLANNER_UPDATED, { daysData: incomingDays, updatedAt: now.toISOString() });

    return {
      daysData: incomingDays,
      updatedAt: now.toISOString(),
    };
  }

  public async saveDay(userId: string, dayKey: string, dayData: DayData): Promise<{ key: string; dayData: DayData; updatedAt: string }> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(`User ${userId} not found`, 404, 'USER_NOT_FOUND');
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      await tx.plannerBlock.deleteMany({
        where: {
          userId,
          dayKey,
        },
      });

      if (Array.isArray(dayData.blocks)) {
        for (let i = 0; i < dayData.blocks.length; i++) {
          const b = dayData.blocks[i];
          if (!b) continue;

          const blockId = isUuid(b.id) ? b.id : toUuid(`planner_${userId}_${dayKey}_${b.id || i}`);

          let validTaskId: string | null = null;
          if (b.taskId && isUuid(b.taskId)) {
            const task = await tx.task.findUnique({ where: { id: b.taskId } });
            if (task) validTaskId = task.id;
          }

          let validCalendarEventId: string | null = null;
          if (b.calendarEventId && isUuid(b.calendarEventId)) {
            const ce = await tx.calendarEvent.findUnique({ where: { id: b.calendarEventId } });
            if (ce) validCalendarEventId = ce.id;
          }

          await tx.plannerBlock.create({
            data: {
              id: blockId,
              userId,
              dayKey,
              title: b.label || 'Untitled Block',
              start: typeof b.start === 'number' ? b.start : 0,
              duration: typeof b.duration === 'number' ? b.duration : 30,
              bucket: b.bucket || 'other',
              kind: b.kind || 'flexible',
              subject: b.subject || null,
              priority: b.priority || null,
              energy: b.energy || null,
              revision: b.revision || undefined,
              groupId: b.groupId || null,
              completed: Boolean(b.completed),
              position: i,
              taskId: validTaskId,
              calendarEventId: validCalendarEventId,
            },
          });
        }
      }

      // Update userSettings sleep and backup
      const settings = await tx.userSettings.findUnique({ where: { userId } });
      const currentPrefs = (settings?.displayPreferences as Record<string, any>) || {};
      const currentSleep = currentPrefs.plannerSleepSettings || {};
      const currentWeekly = currentPrefs.weeklyPlanner || { daysData: {} };

      const updatedPrefs = {
        ...currentPrefs,
        plannerSleepSettings: {
          ...currentSleep,
          [dayKey]: { sleepStart: dayData.sleepStart, sleepEnd: dayData.sleepEnd },
        },
        weeklyPlanner: {
          ...currentWeekly,
          daysData: {
            ...(currentWeekly.daysData || {}),
            [dayKey]: dayData,
          },
          updatedAt: now.toISOString(),
        },
      };

      await tx.userSettings.upsert({
        where: { userId },
        create: {
          userId,
          displayPreferences: updatedPrefs as any,
        },
        update: {
          displayPreferences: updatedPrefs as any,
        },
      });
    });

    emitToUser(userId, SocketEvent.PLANNER_UPDATED, { key: dayKey, dayData, updatedAt: now.toISOString() });

    return {
      key: dayKey,
      dayData,
      updatedAt: now.toISOString(),
    };
  }

  // =========================================================================
  // INDIVIDUAL RELATIONAL CRUD OPERATIONS
  // =========================================================================

  public async createBlock(userId: string, input: Partial<PlannerBlockDTO> & { dayKey: string; label: string }): Promise<PlannerBlockDTO> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(`User ${userId} not found`, 404, 'USER_NOT_FOUND');
    }

    if (!input.dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)) {
      throw new AppError('Valid dayKey in YYYY-MM-DD format is required', 400, 'INVALID_DAY_KEY');
    }
    if (!input.label || input.label.trim().length === 0) {
      throw new AppError('Block title/label is required', 400, 'LABEL_REQUIRED');
    }

    const blockId = input.id && isUuid(input.id) ? input.id : crypto.randomUUID();

    let validTaskId: string | null = null;
    if (input.taskId) {
      const task = await this.validateTaskAssociation(userId, input.taskId);
      validTaskId = task.id;
    }

    let validCalendarEventId: string | null = null;
    if (input.calendarEventId) {
      if (!isUuid(input.calendarEventId)) throw new AppError('Invalid calendarEventId format', 400, 'INVALID_CALENDAR_EVENT_ID');
      const ce = await db.calendarEvent.findUnique({ where: { id: input.calendarEventId } });
      if (!ce) throw new AppError(`Calendar event ${input.calendarEventId} not found`, 404, 'EVENT_NOT_FOUND');
      validCalendarEventId = ce.id;
    }

    const created = await db.plannerBlock.create({
      data: {
        id: blockId,
        userId,
        dayKey: input.dayKey,
        title: input.label.trim(),
        start: typeof input.start === 'number' ? input.start : 9,
        duration: typeof input.duration === 'number' ? input.duration : 60,
        bucket: input.bucket || 'study',
        kind: input.kind || 'flexible',
        subject: input.subject || null,
        priority: input.priority || null,
        energy: input.energy || null,
        revision: input.revision || undefined,
        groupId: input.groupId || null,
        completed: Boolean(input.completed),
        taskId: validTaskId,
        calendarEventId: validCalendarEventId,
      },
      include: {
        task: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
    });

    const formatted = this.formatBlock(created);
    emitToUser(userId, SocketEvent.PLANNER_CREATED, formatted);
    if (created.workspaceId) {
      emitToWorkspace(created.workspaceId, SocketEvent.PLANNER_CREATED, formatted);
    }

    return formatted;
  }

  public async getBlock(userId: string, blockId: string): Promise<PlannerBlockDTO> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    if (!blockId || !isUuid(blockId)) {
      throw new AppError('Invalid block ID format', 400, 'INVALID_BLOCK_ID');
    }

    const block = await db.plannerBlock.findUnique({
      where: { id: blockId },
      include: {
        task: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
    });

    if (!block) {
      throw new AppError(`Planner block ${blockId} not found`, 404, 'NOT_FOUND');
    }

    if (block.userId !== userId) {
      throw new AppError('Forbidden: you do not have permission to access this planner block', 403, 'FORBIDDEN');
    }

    return this.formatBlock(block);
  }

  public async updateBlock(userId: string, blockId: string, input: Partial<PlannerBlockDTO>): Promise<PlannerBlockDTO> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    if (!blockId || !isUuid(blockId)) {
      throw new AppError('Invalid block ID format', 400, 'INVALID_BLOCK_ID');
    }

    const existing = await db.plannerBlock.findUnique({ where: { id: blockId } });
    if (!existing) {
      throw new AppError(`Planner block ${blockId} not found`, 404, 'NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw new AppError('Forbidden: you do not have permission to update this planner block', 403, 'FORBIDDEN');
    }

    let validTaskId = existing.taskId;
    if (input.taskId !== undefined) {
      if (input.taskId === null || input.taskId === '') {
        validTaskId = null;
      } else {
        const task = await this.validateTaskAssociation(userId, input.taskId);
        validTaskId = task.id;
      }
    }

    let validCalendarEventId = existing.calendarEventId;
    if (input.calendarEventId !== undefined) {
      if (input.calendarEventId === null) {
        validCalendarEventId = null;
      } else {
        if (!isUuid(input.calendarEventId)) throw new AppError('Invalid calendarEventId format', 400, 'INVALID_CALENDAR_EVENT_ID');
        const ce = await db.calendarEvent.findUnique({ where: { id: input.calendarEventId } });
        if (!ce) throw new AppError(`Calendar event ${input.calendarEventId} not found`, 404, 'EVENT_NOT_FOUND');
        validCalendarEventId = ce.id;
      }
    }

    // Bidirectional Task Synchronization: if block completion state changes and has taskId
    if (input.completed !== undefined && validTaskId) {
      const taskUpdate = input.completed
        ? { status: TaskStatus.DONE, completedAt: new Date() }
        : { status: TaskStatus.IN_PROGRESS, completedAt: null };
      try {
        const updatedTask = await db.task.update({
          where: { id: validTaskId },
          data: taskUpdate as any,
        });
        if (updatedTask.workspaceId) {
          emitToWorkspace(updatedTask.workspaceId, SocketEvent.TASK_UPDATED, updatedTask);
        }
        if (updatedTask.creatorId) {
          emitToUser(updatedTask.creatorId, SocketEvent.TASK_UPDATED, updatedTask);
        }
      } catch {
        // Task sync resilience
      }
    }

    const updateData: any = {};
    if (input.label !== undefined) updateData.title = input.label.trim();
    if (input.start !== undefined) updateData.start = input.start;
    if (input.duration !== undefined) updateData.duration = input.duration;
    if (input.bucket !== undefined) updateData.bucket = input.bucket;
    if (input.kind !== undefined) updateData.kind = input.kind;
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.energy !== undefined) updateData.energy = input.energy;
    if (input.revision !== undefined) updateData.revision = input.revision;
    if (input.groupId !== undefined) updateData.groupId = input.groupId;
    if (input.completed !== undefined) updateData.completed = input.completed;
    if (input.dayKey !== undefined) updateData.dayKey = input.dayKey;
    updateData.taskId = validTaskId;
    updateData.calendarEventId = validCalendarEventId;

    const updated = await db.plannerBlock.update({
      where: { id: blockId },
      data: updateData,
      include: {
        task: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
    });

    const formatted = this.formatBlock(updated);
    emitToUser(userId, SocketEvent.PLANNER_UPDATED, formatted);
    if (updated.workspaceId) {
      emitToWorkspace(updated.workspaceId, SocketEvent.PLANNER_UPDATED, formatted);
    }

    return formatted;
  }

  public async deleteBlock(userId: string, blockId: string): Promise<boolean> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    if (!blockId || !isUuid(blockId)) {
      throw new AppError('Invalid block ID format', 400, 'INVALID_BLOCK_ID');
    }

    const existing = await db.plannerBlock.findUnique({ where: { id: blockId } });
    if (!existing) {
      throw new AppError(`Planner block ${blockId} not found`, 404, 'NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw new AppError('Forbidden: you do not have permission to delete this planner block', 403, 'FORBIDDEN');
    }

    await db.plannerBlock.delete({ where: { id: blockId } });

    emitToUser(userId, SocketEvent.PLANNER_DELETED, { id: blockId });
    if (existing.workspaceId) {
      emitToWorkspace(existing.workspaceId, SocketEvent.PLANNER_DELETED, { id: blockId });
    }

    return true;
  }

  public async listBlocks(userId: string, filter?: { dayKey?: string; taskId?: string }): Promise<PlannerBlockDTO[]> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    const where: any = { userId };
    if (filter?.dayKey) where.dayKey = filter.dayKey;
    if (filter?.taskId && isUuid(filter.taskId)) where.taskId = filter.taskId;

    const blocks = await db.plannerBlock.findMany({
      where,
      include: {
        task: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
      orderBy: [{ dayKey: 'asc' }, { start: 'asc' }],
    });

    return blocks.map((b) => this.formatBlock(b));
  }
}

export const plannerService = new PlannerService();
