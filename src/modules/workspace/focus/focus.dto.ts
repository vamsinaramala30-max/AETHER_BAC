import { FocusTimerType } from '../workspace.constants';

export class StartFocusSessionDto {
  workspaceId: string;
  type: FocusTimerType;
  durationMinutes: number;
}

export class LogDistractionDto {
  sessionId: string;
  reason?: string;
}

export class FocusAnalyticsDto {
  workspaceId: string;
  userId: string;
  startDate?: Date;
  endDate?: Date;
}