import { FocusRepository } from './focus.repository';
import { StartFocusSessionDto, FocusAnalyticsDto } from './focus.dto';
import { FocusSessionEntity } from './focus.entity';
import { FocusSessionStatus } from '../workspace.constants';

export class FocusService {
  constructor(private readonly focusRepository: FocusRepository) {}

  async startSession(userId: string, dto: StartFocusSessionDto): Promise<FocusSessionEntity> {
    const id = `foc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session = new FocusSessionEntity({
      id,
      userId,
      workspaceId: dto.workspaceId,
      type: dto.type,
      status: FocusSessionStatus.IN_PROGRESS,
      durationMinutes: dto.durationMinutes,
      actualDurationSeconds: 0,
      distractionsCount: 0,
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
}
