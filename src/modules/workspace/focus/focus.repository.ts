import { FocusSessionEntity } from './focus.entity';
import { db } from '../../../database/client';
import { AppError } from '../../../middleware/error.middleware';
import crypto from 'node:crypto';

const isUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val));

export class FocusRepository {
  private mapFromDb(record: any): FocusSessionEntity {
    return new FocusSessionEntity({
      id: record.id,
      userId: record.userId,
      workspaceId: record.workspaceId,
      type: record.type,
      status: record.status,
      durationMinutes: record.durationMinutes,
      actualDurationSeconds: record.actualDurationSeconds,
      distractionsCount: record.distractionsCount,
      taskId: record.taskId || null,
      projectId: record.projectId || null,
      startTime: record.startTime ? new Date(record.startTime) : record.createdAt,
      endTime: record.endTime ? new Date(record.endTime) : null,
      createdAt: record.createdAt,
    });
  }

  async create(userId: string, entity: FocusSessionEntity): Promise<FocusSessionEntity> {
    if (!userId || !isUuid(userId)) {
      throw new AppError('Valid user UUID required to create focus session', 400, 'INVALID_USER_ID');
    }
    const userExists = await db.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      throw new AppError(`User ${userId} not found`, 404, 'USER_NOT_FOUND');
    }

    const sessionId = isUuid(entity.id) ? entity.id : crypto.randomUUID();
    let validWorkspaceId: string | null = null;
    if (entity.workspaceId && isUuid(entity.workspaceId)) {
      const ws = await db.workspace.findUnique({ where: { id: entity.workspaceId } });
      if (ws) validWorkspaceId = ws.id;
    }
    if (!validWorkspaceId) {
      const membership = await db.workspaceMember.findFirst({ where: { userId } });
      if (membership && isUuid(membership.workspaceId)) {
        const ws = await db.workspace.findUnique({ where: { id: membership.workspaceId } });
        if (ws) validWorkspaceId = ws.id;
      }
    }

    let validTaskId: string | null = null;
    if (entity.taskId && isUuid(entity.taskId)) {
      const task = await db.task.findFirst({ where: { id: entity.taskId, deletedAt: null } });
      if (task) validTaskId = task.id;
    }

    let validProjectId: string | null = null;
    if (entity.projectId && isUuid(entity.projectId)) {
      const proj = await db.project.findFirst({ where: { id: entity.projectId, deletedAt: null } });
      if (proj) validProjectId = proj.id;
    }

    // 1. Relational durable persistence in focus_sessions table
    if (db && (db as any).focusSession && typeof (db as any).focusSession.create === 'function') {
      try {
        await (db as any).focusSession.create({
          data: {
            id: sessionId,
            userId,
            workspaceId: validWorkspaceId,
            projectId: validProjectId,
            taskId: validTaskId,
            type: entity.type || 'focus',
            status: entity.status || 'IN_PROGRESS',
            durationMinutes: entity.durationMinutes || 25,
            actualDurationSeconds: entity.actualDurationSeconds || 0,
            distractionsCount: entity.distractionsCount || 0,
            startTime: entity.startTime || new Date(),
            endTime: entity.endTime || null,
          },
        });
      } catch (err: any) {
        throw new AppError(`Database persistence failure: unable to create focus session: ${err?.message}`, 503, 'DATABASE_PERSISTENCE_ERROR');
      }
    }

    // 2. Also record in activityLog for timeline audit compatibility if workspace exists
    const activityWorkspaceId = validWorkspaceId || entity.workspaceId;
    if (activityWorkspaceId) {
      try {
        await db.activityLog.create({
          data: {
            id: sessionId,
            userId,
            workspaceId: activityWorkspaceId,
            action: 'FOCUS_SESSION_STARTED',
            entityType: 'FOCUS_SESSION',
            entityId: sessionId,
            entityName: entity.type || 'focus',
            metadata: {
              id: sessionId,
              type: entity.type,
              status: entity.status,
              durationMinutes: entity.durationMinutes,
              actualDurationSeconds: entity.actualDurationSeconds,
              distractionsCount: entity.distractionsCount,
              taskId: entity.taskId || null,
              projectId: entity.projectId || null,
              startTime: entity.startTime ? entity.startTime.toISOString() : new Date().toISOString(),
            },
          },
        });
      } catch {
        // Activity log is secondary
      }
    }

    entity.id = sessionId;
    entity.userId = userId;
    entity.workspaceId = validWorkspaceId || entity.workspaceId;
    return entity;
  }

  async findById(id: string): Promise<FocusSessionEntity | null> {
    if (!id || !isUuid(id)) return null;

    if (db && (db as any).focusSession && typeof (db as any).focusSession.findUnique === 'function') {
      try {
        const found = await (db as any).focusSession.findUnique({ where: { id } });
        if (found) return this.mapFromDb(found);
      } catch {}
    }

    // Secondary fallback: activityLog
    try {
      const log = await db.activityLog.findFirst({
        where: { entityId: id, entityType: 'FOCUS_SESSION' },
      });
      if (log && log.metadata && typeof log.metadata === 'object') {
        const m = log.metadata as Record<string, any>;
        return new FocusSessionEntity({
          id: m.id || id,
          userId: log.userId,
          workspaceId: log.workspaceId,
          type: m.type || 'focus',
          status: m.status || 'IN_PROGRESS',
          durationMinutes: m.durationMinutes || 25,
          actualDurationSeconds: m.actualDurationSeconds || 0,
          distractionsCount: m.distractionsCount || 0,
          taskId: m.taskId || null,
          projectId: m.projectId || null,
          startTime: m.startTime ? new Date(m.startTime) : log.createdAt,
          endTime: m.endTime ? new Date(m.endTime) : undefined,
          createdAt: log.createdAt,
        });
      }
    } catch {}

    return null;
  }

  async update(entity: FocusSessionEntity): Promise<FocusSessionEntity> {
    if (!entity.id || !isUuid(entity.id)) return entity;

    if (db && (db as any).focusSession && typeof (db as any).focusSession.updateMany === 'function') {
      try {
        await (db as any).focusSession.updateMany({
          where: { id: entity.id },
          data: {
            status: entity.status,
            durationMinutes: entity.durationMinutes,
            actualDurationSeconds: entity.actualDurationSeconds,
            distractionsCount: entity.distractionsCount,
            endTime: entity.endTime || (entity.status === 'COMPLETED' ? new Date() : undefined),
          },
        });
      } catch (err: any) {
        throw new AppError(`Database persistence failure: unable to update focus session: ${err?.message}`, 503, 'DATABASE_PERSISTENCE_ERROR');
      }
    }

    try {
      await db.activityLog.updateMany({
        where: { entityId: entity.id, entityType: 'FOCUS_SESSION' },
        data: {
          action: `FOCUS_SESSION_${entity.status}`,
          metadata: {
            id: entity.id,
            type: entity.type,
            status: entity.status,
            durationMinutes: entity.durationMinutes,
            actualDurationSeconds: entity.actualDurationSeconds,
            distractionsCount: entity.distractionsCount,
            taskId: entity.taskId || null,
            projectId: entity.projectId || null,
            startTime: entity.startTime ? entity.startTime.toISOString() : undefined,
            endTime: entity.endTime ? entity.endTime.toISOString() : undefined,
          },
        },
      });
    } catch {}

    return entity;
  }

  async findByUser(workspaceId?: string, userId?: string): Promise<FocusSessionEntity[]> {
    if (!userId || !isUuid(userId)) return [];

    if (db && (db as any).focusSession && typeof (db as any).focusSession.findMany === 'function') {
      try {
        const where: any = { userId };
        if (workspaceId && isUuid(workspaceId)) {
          where.workspaceId = workspaceId;
        }
        const records = await (db as any).focusSession.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });
        if (records.length > 0) {
          return records.map((r: any) => this.mapFromDb(r));
        }
      } catch {}
    }

    // Secondary fallback: activityLog
    try {
      const logs = await db.activityLog.findMany({
        where: { userId, entityType: 'FOCUS_SESSION' },
        orderBy: { createdAt: 'desc' },
      });

      return logs.map((log) => {
        const m = (log.metadata && typeof log.metadata === 'object' ? log.metadata : {}) as Record<string, any>;
        return new FocusSessionEntity({
          id: m.id || log.id,
          userId: log.userId,
          workspaceId: log.workspaceId,
          type: m.type || 'focus',
          status: m.status || 'COMPLETED',
          durationMinutes: m.durationMinutes || 25,
          actualDurationSeconds: m.actualDurationSeconds || 0,
          distractionsCount: m.distractionsCount || 0,
          taskId: m.taskId || null,
          projectId: m.projectId || null,
          startTime: m.startTime ? new Date(m.startTime) : log.createdAt,
          endTime: m.endTime ? new Date(m.endTime) : undefined,
          createdAt: log.createdAt,
        });
      });
    } catch {
      return [];
    }
  }

  async delete(id: string, userId: string): Promise<boolean> {
    if (!id || !isUuid(id) || !userId || !isUuid(userId)) return false;

    let deleted = false;
    if (db && (db as any).focusSession && typeof (db as any).focusSession.deleteMany === 'function') {
      try {
        const res = await (db as any).focusSession.deleteMany({
          where: { id, userId },
        });
        if (res.count > 0) deleted = true;
      } catch {}
    }

    try {
      const res = await db.activityLog.deleteMany({
        where: { entityId: id, userId, entityType: 'FOCUS_SESSION' },
      });
      if (res.count > 0) deleted = true;
    } catch {}

    return deleted;
  }
}
