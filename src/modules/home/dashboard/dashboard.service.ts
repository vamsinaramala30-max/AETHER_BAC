import { DashboardRepository } from './dashboard.repository';
import { DashboardEntity } from './dashboard.entity';

export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getDashboardSummary(userId: string, workspaceId: string): Promise<DashboardEntity> {
    const stats = await this.dashboardRepository.getMetrics(userId, workspaceId);

    const currentHour = new Date().getHours();
    let greeting = 'Good day';
    if (currentHour < 12) greeting = 'Good morning';
    else if (currentHour < 18) greeting = 'Good afternoon';
    else greeting = 'Good evening';

    return {
      stats,
      greeting,
      userId,
      workspaceId,
    };
  }
}
