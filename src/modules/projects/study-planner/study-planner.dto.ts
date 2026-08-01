// ============================================================================
// File: backend/src/modules/projects/study-planner/study-planner.dto.ts
// ============================================================================

import { StudySessionType } from '../projects.constants';

export interface CreateSubjectDTO {
  userId: string;
  name: string;
  colorHex?: string;
  topics?: string[];
}

export interface CreateStudySessionDTO {
  userId: string;
  subjectId: string;
  topic: string;
  sessionType: StudySessionType;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  notes?: string;
}

export interface StudyPlannerFilterDTO {
  userId?: string;
  subjectId?: string;
  startDate?: Date | string;
  endDate?: Date | string;
}