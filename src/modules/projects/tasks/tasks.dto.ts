// ============================================================================
// File: backend/src/modules/projects/tasks/tasks.dto.ts
// ============================================================================

import { TaskStatus, PriorityLevel, RecurrenceInterval } from '../projects.constants';

export interface CreateTaskDTO {
  projectId: string;
  listId?: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: PriorityLevel;
  assigneeIds?: string[];
  dependencyTaskIds?: string[];
  dueDate?: Date | string;
  estimatedMinutes?: number;
  recurrence?: RecurrenceInterval;
  labels?: string[];
}

export interface UpdateTaskDTO {
  listId?: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: PriorityLevel;
  assigneeIds?: string[];
  dependencyTaskIds?: string[];
  dueDate?: Date | string;
  estimatedMinutes?: number;
  loggedMinutes?: number;
  recurrence?: RecurrenceInterval;
  labels?: string[];
  isCompleted?: boolean;
}

export interface TaskFilterDTO {
  projectId?: string;
  listId?: string;
  status?: TaskStatus;
  priority?: PriorityLevel;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface BulkTaskOperationDTO {
  taskIds: string[];
  action: 'UPDATE_STATUS' | 'DELETE' | 'ASSIGN' | 'ADD_LABEL';
  payload: {
    status?: TaskStatus;
    assigneeIds?: string[];
    label?: string;
  };
}