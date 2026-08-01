import { DocumentStatus } from '../knowledge.constants';

export interface DocumentMetadata {
  fileSize: number;
  mimeType: string;
  originalName: string;
  encoding?: string;
  pageCount?: number;
  wordCount?: number;
  extractedEntities?: string[];
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileKey: string;
  metadata: DocumentMetadata;
  createdAt: Date;
  createdBy: string;
}

export interface DocumentEntity {
  id: string;
  title: string;
  description?: string;
  status: DocumentStatus;
  category: string;
  tags: string[];
  fileKey: string;
  metadata: DocumentMetadata;
  ownerId: string;
  sharedUserIds: string[];
  permissions: {
    canRead: string[];
    canWrite: string[];
  };
  version: number;
  aiSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}