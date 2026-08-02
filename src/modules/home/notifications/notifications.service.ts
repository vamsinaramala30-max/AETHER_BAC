import { NotificationsRepository } from './notifications.repository';
import { NotificationsEntity } from './notifications.entity';

export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async getNotifications(userId: string, limit: number): Promise<NotificationsEntity> {
    const { notifications, unreadCount } = await this.repository.getUserNotifications(
      userId,
      limit,
    );
    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    };
  }

  async markRead(notificationId: string, userId: string) {
    return this.repository.markAsRead(notificationId, userId);
  }
}
