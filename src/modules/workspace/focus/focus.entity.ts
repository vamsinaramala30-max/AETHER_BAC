import { FocusSessionStatus, FocusTimerType } from '../workspace.constants';

export class FocusSessionEntity {
  id: string;
  workspaceId: string;
  userId: string;
  type: FocusTimerType;
  status: FocusSessionStatus;
  durationMinutes: number;
  actualDurationSeconds: number;
  distractionsCount: number;
  startTime?: Date | null;
  endTime?: Date | null;
  createdAt: Date;

  constructor(partial: Partial<FocusSessionEntity>) {
    Object.assign(this, partial);
  }
}