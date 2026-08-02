import { FileActivityType } from '../workspace.constants';

export class RecentFileEntity {
  declare id: string;
  declare workspaceId: string;
  declare userId: string;
  declare fileId: string;
  declare fileName: string;
  declare fileUrl: string;
  declare mimeType: string;
  declare sizeBytes: number;
  declare activityType: FileActivityType;
  declare accessCount: number;
  declare lastOpenedAt: Date;
  declare createdAt: Date;

  constructor(partial: Partial<RecentFileEntity>) {
    Object.assign(this, partial);
  }
}
