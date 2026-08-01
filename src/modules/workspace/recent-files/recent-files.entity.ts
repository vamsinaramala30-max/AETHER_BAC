import { FileActivityType } from '../workspace.constants';

export class RecentFileEntity {
  id: string;
  workspaceId: string;
  userId: string;
  fileId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  activityType: FileActivityType;
  accessCount: number;
  lastOpenedAt: Date;
  createdAt: Date;

  constructor(partial: Partial<RecentFileEntity>) {
    Object.assign(this, partial);
  }
}