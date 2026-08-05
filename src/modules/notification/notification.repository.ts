import { db } from '../../database/client';
import { NotificationPreferencesData } from './notification.types';

const defaultNotificationPreferences: NotificationPreferencesData = {
  emailAlerts: true,
  pushNotifications: true,
  browserNotifications: true,
  workspaceNotifications: true,
  projectNotifications: true,
  mentionNotifications: true,
  automationNotifications: true,
  securityAlerts: true,
  systemUpdates: false,
  weeklyDigest: false,
};

export class NotificationRepository {
  async getPreferences(userId: string) {
    const settings = await db.userSettings.findUnique({ where: { userId } });
    const prefs = (settings?.notificationPrefs as NotificationPreferencesData | null) || {};

    return {
      ...defaultNotificationPreferences,
      ...prefs,
    };
  }

  async updatePreferences(userId: string, data: NotificationPreferencesData) {
    const current = await db.userSettings.findUnique({ where: { userId } });
    const nextPrefs = {
      ...defaultNotificationPreferences,
      ...(current?.notificationPrefs as Record<string, unknown> | undefined),
      ...data,
    };

    if (!current) {
      await db.userSettings.create({
        data: {
          userId,
          notificationPrefs: nextPrefs,
        },
      });
      return nextPrefs;
    }

    await db.userSettings.update({
      where: { userId },
      data: {
        notificationPrefs: nextPrefs,
      },
    });

    return nextPrefs;
  }

  async createNotification(payload: {
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }) {
    return db.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title,
        message: payload.message,
        type: (payload.type as any) || 'SYSTEM',
        link: payload.link,
        metadata: (payload.metadata ?? {}) as any,
      },
    });
  }

  async getUserNotifications(
    userId: string,
    page = 1,
    limit = 20,
    search = '',
    status?: 'read' | 'unread' | 'all',
  ) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { userId };

    if (status === 'read') {
      where.isRead = true;
    } else if (status === 'unread') {
      where.isRead = false;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.notification.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async markAsRead(id: string, userId: string) {
    return db.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(id: string, userId: string) {
    return db.notification.deleteMany({
      where: { id, userId },
    });
  }

  async deleteAllNotifications(userId: string) {
    return db.notification.deleteMany({ where: { userId } });
  }

  async savePushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
    const current = await db.userSettings.findUnique({ where: { userId } });
    const prefs = (current?.notificationPrefs as Record<string, unknown> | undefined) || {};
    const subscriptions = Array.isArray((prefs as Record<string, unknown>).pushSubscriptions)
      ? ((prefs as Record<string, unknown>).pushSubscriptions as Array<Record<string, string>>)
      : [];

    const exists = subscriptions.some((item) => item.endpoint === sub.endpoint);
    const nextSubscriptions = exists
      ? subscriptions.map((item) => (item.endpoint === sub.endpoint ? { ...item, ...sub } : item))
      : [...subscriptions, { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }];

    await db.userSettings.upsert({
      where: { userId },
      update: { notificationPrefs: { ...prefs, pushSubscriptions: nextSubscriptions } },
      create: {
        userId,
        notificationPrefs: {
          ...defaultNotificationPreferences,
          ...prefs,
          pushSubscriptions: nextSubscriptions,
        },
      },
    });

    return { userId, endpoint: sub.endpoint };
  }

  async getPushSubscriptions(userId: string) {
    const settings = await db.userSettings.findUnique({ where: { userId } });
    const prefs = (settings?.notificationPrefs as Record<string, unknown> | undefined) || {};
    const subscriptions = Array.isArray((prefs as Record<string, unknown>).pushSubscriptions)
      ? ((prefs as Record<string, unknown>).pushSubscriptions as Array<Record<string, string>>)
      : [];
    return subscriptions.map((item) => ({
      endpoint: item.endpoint,
      keys: { p256dh: item.p256dh, auth: item.auth },
    }));
  }

  async logDelivery(
    _notificationId: string,
    _channel: string,
    _status: string,
    _attempts = 1,
    _error?: string,
  ) {
    return {
      id: 'stub',
      notificationId: _notificationId,
      channel: _channel,
      status: _status,
      attempts: _attempts,
      error: _error || null,
      createdAt: new Date(),
    };
  }
}
