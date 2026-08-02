// ============================================================================
// File: backend/src/modules/projects/study-planner/study-planner.service.ts
// ============================================================================

import { StudyPlannerRepository } from './study-planner.repository';
import { StudySubject, StudySession, StudyStreak } from './study-planner.entity';
import {
  CreateSubjectDTO,
  CreateStudySessionDTO,
  StudyPlannerFilterDTO,
} from './study-planner.dto';

export class StudyPlannerService {
  constructor(private readonly repository: StudyPlannerRepository) {}

  async createSubject(dto: CreateSubjectDTO): Promise<StudySubject> {
    const subject: StudySubject = {
      id: `sbj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: dto.name,
      colorHex: dto.colorHex || '#3B82F6',
      topics: dto.topics || [],
    };
    return this.repository.saveSubject(subject);
  }

  async createSession(dto: CreateStudySessionDTO): Promise<StudySession> {
    const session: StudySession = {
      id: `ssn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: dto.userId,
      subjectId: dto.subjectId,
      topic: dto.topic,
      sessionType: dto.sessionType,
      scheduledStart: new Date(dto.scheduledStart),
      scheduledEnd: new Date(dto.scheduledEnd),
      actualDurationMinutes: 0,
      isCompleted: false,
      notes: dto.notes || null,
      createdAt: new Date(),
    };
    return this.repository.saveSession(session);
  }

  async getSessions(filter: StudyPlannerFilterDTO): Promise<StudySession[]> {
    if (!filter.userId) return [];
    return this.repository.findSessions(
      filter.userId,
      filter.startDate ? new Date(filter.startDate) : undefined,
      filter.endDate ? new Date(filter.endDate) : undefined,
    );
  }

  async completeSession(sessionId: string, durationMinutes: number): Promise<StudySession> {
    const sessions = await this.repository.findSessions('');
    const session = Array.from(sessions).find((s) => s.id === sessionId);
    if (!session) throw new Error(`Study session ${sessionId} not found.`);

    session.isCompleted = true;
    session.actualDurationMinutes = durationMinutes;
    await this.repository.saveSession(session);

    await this.updateStreak(session.userId);
    return session;
  }

  private async updateStreak(userId: string): Promise<StudyStreak> {
    const streak = await this.repository.getStreak(userId);
    const now = new Date();
    streak.currentStreakDays += 1;
    if (streak.currentStreakDays > streak.longestStreakDays) {
      streak.longestStreakDays = streak.currentStreakDays;
    }
    streak.lastActiveDate = now;
    return this.repository.saveStreak(streak);
  }
}
