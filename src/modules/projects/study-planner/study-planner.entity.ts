// ============================================================================
// File: backend/src/modules/projects/study-planner/study-planner.entity.ts
// ============================================================================

import { StudySessionType } from '../projects.constants';

export interface StudySubject {
  id: string;
  name: string;
  colorHex: string;
  topics: string[];
}

export interface StudySession {
  id: string;
  userId: string;
  subjectId: string;
  topic: string;
  sessionType: StudySessionType;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualDurationMinutes: number;
  isCompleted: boolean;
  notes: string | null;
  createdAt: Date;
}

export interface StudyStreak {
  userId: string;
  currentStreakDays: number;
  longestStreakDays: number;
  lastActiveDate: Date | null;
}
