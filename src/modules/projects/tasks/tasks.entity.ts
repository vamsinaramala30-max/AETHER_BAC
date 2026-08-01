// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.entity.ts
// ============================================================================

import { TaskStatus, PriorityLevel, RecurrenceInterval } from '../projects.constants';

export interface TaskChecklistItem {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface TaskComment {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

export interface TaskEntity {
  id: string;
  projectId: string;
  listId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: PriorityLevel;
  assigneeIds: string[];
  dependencyTaskIds: string[];
  dueDate: Date | null;
  estimatedMinutes: number | null;
  loggedMinutes: number;
  recurrence: RecurrenceInterval;
  labels: string[];
  checklists: TaskChecklistItem[];
  comments: TaskComment[];
  isCompleted: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}