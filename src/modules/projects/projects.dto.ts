// ============================================================================
// File: backend/src/modules/projects/projects/projects.dto.ts
// ============================================================================

import { ProjectStatus, PriorityLevel } from './projects.constants';

export interface CreateProjectDTO {
  ownerId: string;
  name: string;
  description?: string;
  templateId?: string;
  category: string;
  status?: ProjectStatus;
  priority?: PriorityLevel;
  startDate?: Date | string;
  endDate?: Date | string;
  dueDate?: Date | string;
  tags?: string[];
  members?: { userId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' }[];
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string;
  category?: string;
  status?: ProjectStatus;
  priority?: PriorityLevel;
  progressPercentage?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  dueDate?: Date | string;
  tags?: string[];
  isFavorite?: boolean;
}

export interface ProjectFilterDTO {
  ownerId?: string;
  memberId?: string;
  category?: string;
  status?: ProjectStatus;
  priority?: PriorityLevel;
  isArchived?: boolean;
  isFavorite?: boolean;
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate' | 'name' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

export interface ProjectDuplicateDTO {
  newOwnerId: string;
  newName: string;
  includeTasks?: boolean;
  includeGoals?: boolean;
}
