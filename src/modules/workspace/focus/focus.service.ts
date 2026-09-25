import { FocusRepository } from './focus.repository';
import { StartFocusSessionDto, FocusAnalyticsDto } from './focus.dto';
import { FocusSessionEntity } from './focus.entity';
import { FocusSessionStatus } from '../workspace.constants';
import crypto from 'node:crypto';

export class FocusService {
  constructor(private readonly focusRepository: FocusRepository) {}

  async startSession(userId: string, dto: StartFocusSessionDto): Promise<FocusSessionEntity> {
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
      taskId: dto.taskId || null,
      projectId: dto.projectId || null,
      startTime: new Date(),
      createdAt: new Date(),
    });

    return this.focusRepository.create(userId, session);
  }

  async completeSession(
    sessionId: string,
    actualDurationSeconds: number,
  ): Promise<FocusSessionEntity> {
    const session = await this.focusRepository.findById(sessionId);
    if (!session) throw new Error(`Focus session ${sessionId} not found`);

    session.status = FocusSessionStatus.COMPLETED;
    session.actualDurationSeconds = actualDurationSeconds;
    session.endTime = new Date();

    return this.focusRepository.update(session);
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
