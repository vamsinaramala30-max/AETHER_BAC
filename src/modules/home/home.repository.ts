import { PrismaClient } from '@prisma/client';

export class HomeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getAggregatedHomeData(userId: string, workspaceId: string) {
    const [projectCount, conversationCount, unreadNotifications] = await Promise.all([
      this.prisma.project.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.conversation.count({ where: { workspaceId, userId, deletedAt: null } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { projectCount, conversationCount, unreadNotifications };
  }
}