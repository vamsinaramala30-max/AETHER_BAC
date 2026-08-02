import { RecentActivityRepository } from './recent-activity.repository';
import { RecentActivityEntity } from './recent-activity.entity';

export class RecentActivityService {
  constructor(private readonly repository: RecentActivityRepository) {}

  async getActivity(userId: string, limit: number): Promise<RecentActivityEntity> {
    const logs = await this.repository.getLogs(userId, limit);
    return {
      activities: logs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }
}
