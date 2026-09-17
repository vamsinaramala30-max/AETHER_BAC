import { FocusSessionEntity } from './focus.entity';
import { db } from '../../../database/client';
import crypto from 'node:crypto';

function toUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export class FocusRepository {
  private sessions: Map<string, FocusSessionEntity> = new Map();

  async create(userId: string, entity: FocusSessionEntity): Promise<FocusSessionEntity> {
    this.sessions.set(entity.id, entity);
    try {
      const validUserId = toUuid(userId);
      const validEntityId = toUuid(entity.id);
      let validWorkspaceId = toUuid(entity.workspaceId || '');

      const membership = await db.workspaceMember.findFirst({
        where: { userId: validUserId },
      });
      if (membership) {
        validWorkspaceId = membership.workspaceId;
      }

      if (validWorkspaceId) {
        await db.activityLog.create({
          data: {
            id: validEntityId,
            userId: validUserId,
            workspaceId: validWorkspaceId,
            action: 'FOCUS_SESSION_STARTED',
            entityType: 'FOCUS_SESSION',
            entityId: validEntityId,
            entityName: entity.type || 'focus',
            metadata: {
              id: entity.id,
              type: entity.type,
              status: entity.status,
              durationMinutes: entity.durationMinutes,
              actualDurationSeconds: entity.actualDurationSeconds,
              distractionsCount: entity.distractionsCount,
              startTime: entity.startTime
                ? entity.startTime.toISOString()
                : new Date().toISOString(),
            },
          },
        });
      }
    } catch {
      // Memory fallback
    }
    return entity;
  }

  async findById(id: string): Promise<FocusSessionEntity | null> {
    const mem = this.sessions.get(id);
    if (mem) return mem;

    try {
      const validEntityId = toUuid(id);
      const log = await db.activityLog.findFirst({
        where: { entityId: validEntityId, entityType: 'FOCUS_SESSION' },
      });
      if (log && log.metadata && typeof log.metadata === 'object') {
        const m = log.metadata as Record<string, any>;
        const entity = new FocusSessionEntity({
          id: m.id || id,
          userId: log.userId,
          workspaceId: log.workspaceId,
          type: m.type || 'focus',
          status: m.status || 'IN_PROGRESS',
          durationMinutes: m.durationMinutes || 25,
          actualDurationSeconds: m.actualDurationSeconds || 0,
          distractionsCount: m.distractionsCount || 0,
          startTime: m.startTime ? new Date(m.startTime) : log.createdAt,
          endTime: m.endTime ? new Date(m.endTime) : undefined,
          createdAt: log.createdAt,
        });
        this.sessions.set(entity.id, entity);
        return entity;
      }
    } catch {
      // Memory fallback
    }
    return null;
  }

  async update(entity: FocusSessionEntity): Promise<FocusSessionEntity> {
    this.sessions.set(entity.id, entity);
    try {
      const validEntityId = toUuid(entity.id);
      await db.activityLog.updateMany({
        where: { entityId: validEntityId, entityType: 'FOCUS_SESSION' },
        data: {
          action: `FOCUS_SESSION_${entity.status}`,
          metadata: {
            id: entity.id,
            type: entity.type,
            status: entity.status,
            durationMinutes: entity.durationMinutes,
            actualDurationSeconds: entity.actualDurationSeconds,
            distractionsCount: entity.distractionsCount,
            startTime: entity.startTime ? entity.startTime.toISOString() : undefined,
            endTime: entity.endTime ? entity.endTime.toISOString() : undefined,
          },
        },
      });
    } catch {
      // Memory fallback
    }
    return entity;
  }

  async findByUser(workspaceId: string, userId: string): Promise<FocusSessionEntity[]> {
    const validUserId = toUuid(userId);
    let dbSessions: FocusSessionEntity[] = [];

    try {
      const logs = await db.activityLog.findMany({
        where: { userId: validUserId, entityType: 'FOCUS_SESSION' },
        orderBy: { createdAt: 'desc' },
      });

      dbSessions = logs.map((log) => {
        const m = (log.metadata && typeof log.metadata === 'object' ? log.metadata : {}) as Record<
          string,
          any
        >;
        return new FocusSessionEntity({
          id: m.id || log.id,
          userId: log.userId,
          workspaceId: log.workspaceId,
          type: m.type || 'focus',
          status: m.status || 'COMPLETED',
          durationMinutes: m.durationMinutes || 25,
          actualDurationSeconds: m.actualDurationSeconds || 0,
          distractionsCount: m.distractionsCount || 0,
          startTime: m.startTime ? new Date(m.startTime) : log.createdAt,
          endTime: m.endTime ? new Date(m.endTime) : undefined,
          createdAt: log.createdAt,
        });
      });
    } catch {
      // Memory fallback
    }

    if (dbSessions.length > 0) {
      return dbSessions;
    }

    return Array.from(this.sessions.values()).filter(
      (s) => (s.workspaceId === workspaceId || !workspaceId) && s.userId === userId,
    );
  }
}
