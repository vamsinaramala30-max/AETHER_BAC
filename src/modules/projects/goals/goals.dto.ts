// ============================================================================
// File: backend/src/modules/projects/goals/goals.dto.ts
// ============================================================================

import { GoalType, GoalStatus } from '../projects.constants';

export interface CreateGoalDTO {
  userId: string;
  title: string;
  description?: string;
  type: GoalType;
  category: string;
  targetValue?: number;
  unit?: string;
  deadline: Date | string;
  linkedProjectIds?: string[];
  linkedTaskIds?: string[];
}

export interface UpdateGoalDTO {
  title?: string;
  description?: string;
  status?: GoalStatus;
  category?: string;
  targetValue?: number;
  currentValue?: number;
  deadline?: Date | string;
  linkedProjectIds?: string[];
  linkedTaskIds?: string[];
}

export interface GoalFilterDTO {
  userId?: string;
  category?: string;
  type?: GoalType;
  status?: GoalStatus;
  page?: number;
  limit?: number;
}
