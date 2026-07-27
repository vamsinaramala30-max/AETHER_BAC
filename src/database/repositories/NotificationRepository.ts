import { Notification, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class NotificationRepository extends PrismaService {
  public async findById(id: string, tx?: TransactionClient): Promise<Notification | null> {
    const client = tx || this.prisma;
    return client.notification.findUnique({
      where: { id },
    });
  }

  public async create(
    data: Prisma.NotificationCreateInput,
    tx?: TransactionClient,
  ): Promise<Notification> {
    const client = tx || this.prisma;
    return client.notification.create({
      data,
    });
  }

  public async getUserNotifications(
    userId: string,
    limit: number = 20,
    skip: number = 0,
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { notifications, total, unreadCount };
  }

  public async markAsRead(id: string, tx?: TransactionClient): Promise<Notification> {
    const client = tx || this.prisma;
    return client.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  public async markAllAsRead(userId: string, tx?: TransactionClient): Promise<Prisma.BatchPayload> {
    const client = tx || this.prisma;
    return client.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
