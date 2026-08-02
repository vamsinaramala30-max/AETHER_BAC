import { FocusTimerType } from '../workspace.constants';

export class StartFocusSessionDto {
  declare workspaceId: string;
  declare type: FocusTimerType;
  declare durationMinutes: number;
}

export class LogDistractionDto {
  declare sessionId: string;
  reason?: string;
}

export class FocusAnalyticsDto {
  declare workspaceId: string;
  declare userId: string;
  startDate?: Date;
  endDate?: Date;
}
