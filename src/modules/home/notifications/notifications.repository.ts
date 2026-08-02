import { PrismaClient } from '@prisma/client';

export class NotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getUserNotifications(userId: string, limit: number) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { notifications, unreadCount };
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }
}
