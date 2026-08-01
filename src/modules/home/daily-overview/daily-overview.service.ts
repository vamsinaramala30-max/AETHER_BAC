import { DailyOverviewRepository } from './daily-overview.repository';
import { DailyOverviewEntity } from './daily-overview.entity';

export class DailyOverviewService {
  constructor(private readonly repository: DailyOverviewRepository) {}

  async getOverview(userId: string, workspaceId: string): Promise<DailyOverviewEntity> {
    return this.repository.getDailyStats(userId, workspaceId);
  }
}