import { PrismaClient } from '@prisma/client';

export class DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getMetrics(userId: string, workspaceId: string) {
    const [totalProjects, totalConversations, totalDocuments, unreadNotifications] = await Promise.all([
      this.prisma.project.count({
        where: { workspaceId, deletedAt: null },
      }),
      this.prisma.conversation.count({
        where: { workspaceId, userId, deletedAt: null },
      }),
      this.prisma.document.count({
        where: { knowledgeBase: { workspaceId } },
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      totalProjects,
      totalConversations,
      totalDocuments,
      unreadNotifications,
    };
  }
}