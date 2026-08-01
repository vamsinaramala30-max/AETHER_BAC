import { FileActivityType } from '../workspace.constants';

export class TrackFileAccessDto {
  workspaceId: string;
  fileId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  activityType: FileActivityType;
}

export class QueryRecentFilesDto {
  workspaceId: string;
  search?: string;
  mimeType?: string;
  page?: number;
  limit?: number;
}