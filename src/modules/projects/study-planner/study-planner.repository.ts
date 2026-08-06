// ============================================================================
// File: backend/src/modules/projects/study-planner/study-planner.repository.ts
// ============================================================================

import { StudySubject, StudySession, StudyStreak } from './study-planner.entity';

export class StudyPlannerRepository {
  private subjects: Map<string, StudySubject> = new Map();
  private sessions: Map<string, StudySession> = new Map();
  private streaks: Map<string, StudyStreak> = new Map();

  async saveSubject(subject: StudySubject): Promise<StudySubject> {
    this.subjects.set(subject.id, subject);
    return subject;
  }

  async findSubjectsByUser(_userId: string): Promise<StudySubject[]> {
    return Array.from(this.subjects.values());
  }

  async saveSession(session: StudySession): Promise<StudySession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessions(userId: string, startDate?: Date, endDate?: Date): Promise<StudySession[]> {
    let result = Array.from(this.sessions.values()).filter((s) => s.userId === userId);
    if (startDate) {
      result = result.filter((s) => s.scheduledStart >= startDate);
    }
    if (endDate) {
      result = result.filter((s) => s.scheduledEnd <= endDate);
    }
    return result;
  }

  async getStreak(userId: string): Promise<StudyStreak> {
    const streak = this.streaks.get(userId);
    if (streak) return streak;
    const initial: StudyStreak = {
      userId,
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastActiveDate: null,
    };
    this.streaks.set(userId, initial);
    return initial;
  }

  async saveStreak(streak: StudyStreak): Promise<StudyStreak> {
    this.streaks.set(streak.userId, streak);
    return streak;
  }
}
