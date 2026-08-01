import { TodaysScheduleRepository } from './todays-schedule.repository';
import { TodaysScheduleEntity } from './todays-schedule.entity';

export class TodaysScheduleService {
  constructor(private readonly repository: TodaysScheduleRepository) {}

  async getSchedule(userId: string, workspaceId: string): Promise<TodaysScheduleEntity> {
    const items = await this.repository.getScheduledEvents(userId, workspaceId);
    return { items };
  }
}