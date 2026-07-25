import { PrismaClient, Prisma } from '@prisma/client';
import { NotificationPreferencesData } from './notification.types';

const prisma = new PrismaClient();

export class NotificationRepository {
  async getPreferences(userId: string) {
    return prisma.notification.findFirst({
      where: { userId },
      select: { id: true, userId: true, isRead: true, createdAt: true },
    });
  }

  async updatePreferences(userId: string, _data: NotificationPreferencesData) {
    // preferences are stored in user settings; stub implementation
    return { userId, ..._data };
  }

  async createNotification(userId: string, title: string, message: string) {
    return prisma.notification.create({
      data: { userId, title, message },
    });
  }

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total, page, totalPages: Math.ceil(total / limit) };
  }

  async markAsRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(id: string, userId: string) {
    return prisma.notification.deleteMany({
      where: { id, userId },
    });
  }

  async savePushSubscription(_userId: string, _sub: { endpoint: string; p256dh: string; auth: string }) {
    // Push subscriptions not in schema; store as stub
    return { id: 'stub', userId: _userId, endpoint: _sub.endpoint, p256dh: _sub.p256dh, auth: _sub.auth, createdAt: new Date() };
  }

  async getPushSubscriptions(_userId: string) {
    return [];
  }

  async logDelivery(_notificationId: string, _channel: string, _status: string, _attempts = 1, _error?: string) {
    return { id: 'stub', notificationId: _notificationId, channel: _channel, status: _status, attempts: _attempts, error: _error || null, createdAt: new Date() };
  }
}
