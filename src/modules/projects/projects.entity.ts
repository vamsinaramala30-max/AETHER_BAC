// ============================================================================
// File: backend/src/modules/projects/projects/projects.entity.ts
// ============================================================================

import { ProjectStatus, PriorityLevel } from './projects.constants';

export interface ProjectMember {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  joinedAt: Date;
}

export interface ProjectAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface ProjectNote {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectEntity {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  templateId: string | null;
  category: string;
  status: ProjectStatus;
  priority: PriorityLevel;
  progressPercentage: number;
  startDate: Date | null;
  endDate: Date | null;
  dueDate: Date | null;
  members: ProjectMember[];
  tags: string[];
  attachments: ProjectAttachment[];
  notes: ProjectNote[];
  isArchived: boolean;
  isFavorite: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
