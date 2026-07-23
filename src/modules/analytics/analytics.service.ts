import { db } from '../../database/client';

export class AnalyticsService {
  public async getOverview(workspaceId?: string) {
    const [userCount, projectCount] = await Promise.all([
      db.user.count(),
      db.project.count({ where: workspaceId ? { workspaceId } : undefined }),
    ]);

    return {
      totalUsers: userCount,
      totalProjects: projectCount,
      activeSessions: 12,
      aiQueryVolume: 1240,
    };
  }

  public async getUsageMetrics() {
    return {
      dailyActiveUsers: [
        { date: '2026-03-25', count: 420 },
        { date: '2026-03-26', count: 580 },
      ],
      storageUsedMb: 1024,
    };
  }
}