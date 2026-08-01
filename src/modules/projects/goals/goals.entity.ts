// ============================================================================
// File: backend/src/modules/projects/goals/goals.entity.ts
// ============================================================================

import { GoalType, GoalStatus } from '../projects.constants';

export interface Milestone {
  id: string;
  title: string;
  targetDate: Date;
  isAchieved: boolean;
  achievedAt: Date | null;
}

export interface GoalEntity {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: GoalType;
  status: GoalStatus;
  category: string;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  deadline: Date;
  milestones: Milestone[];
  linkedProjectIds: string[];
  linkedTaskIds: string[];
  isCompleted: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}