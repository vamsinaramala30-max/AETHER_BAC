import { FileActivityType } from '../workspace.constants';

export class TrackFileAccessDto {
  declare workspaceId: string;
  declare fileId: string;
  declare fileName: string;
  declare fileUrl: string;
  declare mimeType: string;
  declare sizeBytes: number;
  declare activityType: FileActivityType;
}

export class QueryRecentFilesDto {
  declare workspaceId: string;
  search?: string;
  mimeType?: string;
  page?: number;
  limit?: number;
}
