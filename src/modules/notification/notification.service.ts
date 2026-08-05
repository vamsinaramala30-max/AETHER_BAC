import { NotificationRepository } from './notification.repository';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import {
  NotificationPreferencesData,
  SendNotificationDTO,
  PushSubscriptionDTO,
} from './notification.types';

export class NotificationService {
  constructor(
    private repo: NotificationRepository,
    private emailService?: EmailService,
    private pushService?: PushService,
  ) {
    this.repo = repo;
    this.emailService = emailService || new EmailService();
    this.pushService = pushService || new PushService();
  }

  private normalizePreferences(pref: Partial<NotificationPreferencesData>): NotificationPreferencesData {
    return {
      emailAlerts: pref.emailAlerts ?? true,
      pushNotifications: pref.pushNotifications ?? true,
      browserNotifications: pref.browserNotifications ?? true,
      workspaceNotifications: pref.workspaceNotifications ?? true,
      projectNotifications: pref.projectNotifications ?? true,
      mentionNotifications: pref.mentionNotifications ?? true,
      automationNotifications: pref.automationNotifications ?? true,
      securityAlerts: pref.securityAlerts ?? true,
      systemUpdates: pref.systemUpdates ?? false,
      weeklyDigest: pref.weeklyDigest ?? false,
    };
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesData> {
    const pref = await this.repo.getPreferences(userId);
    return this.normalizePreferences(pref);
  }

  async updatePreferences(
    userId: string,
    data: NotificationPreferencesData,
  ): Promise<NotificationPreferencesData> {
    const updated = await this.repo.updatePreferences(userId, data);
    return this.normalizePreferences(updated);
  }

  async dispatchNotification(dto: SendNotificationDTO) {
    const prefs = this.normalizePreferences(await this.getPreferences(dto.userId));
    const categoryEnabled = Boolean((prefs as unknown as Record<string, boolean>)[dto.category]);
    if (!categoryEnabled) {
      return { skipped: true, reason: 'Category disabled in user preferences' };
    }

    const results: Record<string, boolean> = {};

    if (dto.channels.includes('IN_APP')) {
      await this.repo.createNotification({
        userId: dto.userId,
        title: dto.title,
        message: dto.message,
        type: dto.type,
        link: dto.link,
        metadata: dto.metadata,
      });
      results.IN_APP = true;
    }

    if (dto.channels.includes('EMAIL') && dto.email) {
      const sent = await this.emailService!.sendEmail(dto.email, dto.title, dto.message);
      results.EMAIL = sent;
    }

    if (dto.channels.includes('PUSH')) {
      const subs = await this.repo.getPushSubscriptions(dto.userId);
      for (const sub of subs) {
        const sent = await this.pushService!.sendPushNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          { title: dto.title, message: dto.message },
        );
        results.PUSH = sent || results.PUSH;
      }
      if (Object.keys(results).length === 0) {
        results.PUSH = false;
      }
    }

    return results;
  }

  async registerPush(userId: string, dto: PushSubscriptionDTO) {
    return this.repo.savePushSubscription(userId, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    });
  }

  async getHistory(userId: string, page = 1, limit = 20, search = '', status?: 'read' | 'unread' | 'all') {
    const data = await this.repo.getUserNotifications(userId, page, limit, search, status);
    const unreadCount = await this.repo.getUserNotifications(userId, 1, 100000, '', 'unread');
    return {
      items: data.items,
      unreadCount: unreadCount.total,
      pagination: {
        page: data.page,
        limit,
        total: data.total,
        totalPages: data.totalPages,
      },
    };
  }

  async markAsRead(id: string, userId: string) {
    return this.repo.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string) {
    return this.repo.markAllAsRead(userId);
  }

  async deleteNotification(id: string, userId: string) {
    return this.repo.deleteNotification(id, userId);
  }

  async deleteAllNotifications(userId: string) {
    return this.repo.deleteAllNotifications(userId);
  }

  async createNotification(payload: {
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.repo.createNotification(payload);
  }
}
