import { FocusSessionStatus, FocusTimerType } from '../workspace.constants';

export class FocusSessionEntity {
  declare id: string;
  declare workspaceId: string;
  declare userId: string;
  declare type: FocusTimerType;
  declare status: FocusSessionStatus;
  declare durationMinutes: number;
  declare actualDurationSeconds: number;
  declare distractionsCount: number;
  startTime?: Date | null;
  endTime?: Date | null;
  declare createdAt: Date;

  constructor(partial: Partial<FocusSessionEntity>) {
    Object.assign(this, partial);
  }
}
