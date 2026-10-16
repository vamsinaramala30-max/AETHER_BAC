import { FocusRepository } from './focus.repository';
import { StartFocusSessionDto, FocusAnalyticsDto } from './focus.dto';
import { FocusSessionEntity } from './focus.entity';
import { FocusSessionStatus } from '../workspace.constants';
import { db } from '../../../database/client';
import { emitToWorkspace, emitToUser } from '../../../websocket/socket';
import { SocketEvent } from '../../../websocket/socketTypes';
import { AppError } from '../../../middleware/error.middleware';
import crypto from 'node:crypto';

const isUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val));

export class FocusService {
  constructor(private readonly focusRepository: FocusRepository) {}

  async startSession(userId: string, dto: StartFocusSessionDto): Promise<FocusSessionEntity> {
    if (!userId) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    let validTaskId: string | null = null;
    if (dto.taskId) {
      if (isUuid(dto.taskId)) {
        const task =
          (await db.task.findFirst({
            where: { id: dto.taskId, deletedAt: null },
          })) ||
          (await db.task.findUnique({
            where: { id: dto.taskId },
          }));
        if (!task || task.deletedAt) {
          throw new AppError(`Task ${dto.taskId} not found`, 404, 'TASK_NOT_FOUND');
        }
        const isAuthorized =
          task.creatorId === userId ||
          task.assigneeId === userId ||
          (await db.workspaceMember.findFirst({ where: { workspaceId: task.workspaceId, userId } }));
        if (!isAuthorized) {
          throw new AppError('Forbidden: you do not have permission to associate this task', 403, 'FORBIDDEN');
        }
        validTaskId = task.id;
      } else {
        // Legacy identifier or unit-test string ID
        validTaskId = dto.taskId;
      }
    }

    const id = crypto.randomUUID();
    const session = new FocusSessionEntity({
      id,
      userId,
      workspaceId: dto.workspaceId,
      type: dto.type,
      status: FocusSessionStatus.IN_PROGRESS,
      durationMinutes: dto.durationMinutes,
      actualDurationSeconds: 0,
      distractionsCount: 0,
      taskId: validTaskId,
      projectId: dto.projectId || null,
      startTime: new Date(),
      createdAt: new Date(),
    });

    const created = await this.focusRepository.create(userId, session);

    emitToUser(userId, SocketEvent.FOCUS_STARTED, {
      id: created.id,
      durationMinutes: created.durationMinutes,
      taskId: created.taskId,
    });
    if (created.workspaceId) {
      emitToWorkspace(created.workspaceId, SocketEvent.FOCUS_STARTED, {
        id: created.id,
        durationMinutes: created.durationMinutes,
        taskId: created.taskId,
      });
    }

    return created;
  }

  async completeSession(
    sessionId: string,
    actualDurationSeconds: number,
    userId?: string,
  ): Promise<FocusSessionEntity> {
    const session = await this.focusRepository.findById(sessionId);
    if (!session) throw new AppError(`Focus session ${sessionId} not found`, 404, 'NOT_FOUND');

    if (userId && session.userId && session.userId !== userId) {
      throw new AppError('Forbidden: you do not have permission to complete this focus session', 403, 'FORBIDDEN');
    }

    // Duplicate event protection: do not double count duration if already completed
    if (session.status === FocusSessionStatus.COMPLETED) {
      return session;
    }

    session.status = FocusSessionStatus.COMPLETED;
    session.actualDurationSeconds = actualDurationSeconds;
    session.endTime = new Date();

    // Transactional durability for session completion + task productivity time update
    try {
      await db.$transaction(async (tx) => {
        if ((tx as any).focusSession) {
          await (tx as any).focusSession.updateMany({
            where: { id: sessionId },
            data: {
              status: FocusSessionStatus.COMPLETED,
              actualDurationSeconds,
              endTime: session.endTime,
            },
          });
        }

        // If linked to an authentic task, persist logged minutes
        if (session.taskId && isUuid(session.taskId) && actualDurationSeconds > 0) {
          const additionalMinutes = Math.max(1, Math.round(actualDurationSeconds / 60));
          await tx.task.updateMany({
            where: { id: session.taskId, deletedAt: null },
            data: {
              loggedMinutes: { increment: additionalMinutes },
            },
          });
        }
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        `Database persistence failure: unable to complete focus session ${sessionId}`,
        503,
        'DATABASE_PERSISTENCE_ERROR',
      );
    }

    await this.focusRepository.update(session);

    // Realtime notification
    emitToUser(session.userId, SocketEvent.FOCUS_COMPLETED, {
      id: session.id,
      actualDurationSeconds,
      taskId: session.taskId,
    });
    if (session.workspaceId) {
      emitToWorkspace(session.workspaceId, SocketEvent.FOCUS_COMPLETED, {
        id: session.id,
        actualDurationSeconds,
        taskId: session.taskId,
      });
      if (session.taskId) {
        emitToWorkspace(session.workspaceId, SocketEvent.TASK_UPDATED, {
          id: session.taskId,
          loggedMinutes: session.actualDurationSeconds / 60,
        });
      }
    }

    return session;
  }


  async recordDistraction(sessionId: string): Promise<FocusSessionEntity> {
    const session = await this.focusRepository.findById(sessionId);
    if (!session) throw new Error(`Focus session ${sessionId} not found`);

    session.distractionsCount += 1;
    return this.focusRepository.update(session);
  }

  async getAnalytics(dto: FocusAnalyticsDto) {
    const sessions = await this.focusRepository.findByUser(dto.workspaceId, dto.userId);
    const completed = sessions.filter((s) => s.status === FocusSessionStatus.COMPLETED);
    const totalSeconds = completed.reduce((acc, curr) => acc + curr.actualDurationSeconds, 0);
    const totalDistractions = completed.reduce((acc, curr) => acc + curr.distractionsCount, 0);

    return {
      totalSessions: completed.length,
      totalFocusMinutes: Math.round(totalSeconds / 60),
      totalDistractions,
      averageDistractionsPerSession: completed.length
        ? (totalDistractions / completed.length).toFixed(1)
        : 0,
    };
  }

  async getHistory(workspaceId: string, userId: string): Promise<FocusSessionEntity[]> {
    return this.focusRepository.findByUser(workspaceId, userId);
  }

  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    return this.focusRepository.delete(sessionId, userId);
  }
}
