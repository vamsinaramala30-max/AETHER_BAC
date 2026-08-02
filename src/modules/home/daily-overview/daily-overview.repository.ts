import { PrismaClient } from '@prisma/client';

export class DailyOverviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getDailyStats(userId: string, workspaceId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [activeConversationsToday, newFilesToday, executedAutomationsToday] = await Promise.all([
      this.prisma.conversation.count({
        where: {
          workspaceId,
          userId,
          updatedAt: { gte: startOfDay },
        },
      }),
      this.prisma.file.count({
        where: {
          userId,
          createdAt: { gte: startOfDay },
        },
      }),
      this.prisma.automation.count({
        where: {
          workspaceId,
          isEnabled: true,
          updatedAt: { gte: startOfDay },
        },
      }),
    ]);

    return {
      activeConversationsToday,
      newFilesToday,
      executedAutomationsToday,
      date: startOfDay.toISOString(),
    };
  }
}
