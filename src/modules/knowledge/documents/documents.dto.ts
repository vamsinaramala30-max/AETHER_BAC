import { DocumentStatus } from '../knowledge.constants';

export class CreateDocumentDto {
  title!: string;
  description?: string;
  category?: string;
  tags?: string[];
  fileKey!: string;
  fileSize!: number;
  mimeType!: string;
  originalName!: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  async?: boolean;
  metadata?: Record<string, any>;
}

export class UpdateDocumentDto {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  status?: DocumentStatus;
  fileKey?: string;
  projectId?: string;
}

export class QueryDocumentsDto {
  page?: number;
  limit?: number;
  category?: string;
  status?: DocumentStatus;
  tags?: string[];
  search?: string;
  workspaceId?: string;
  projectId?: string;
}

