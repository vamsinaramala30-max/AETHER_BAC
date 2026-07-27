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

  async getPreferences(userId: string): Promise<NotificationPreferencesData> {
    const pref = await this.repo.getPreferences(userId);
    return {
      emailAlerts: (pref as any)?.emailAlerts ?? true,
      securityAlerts: (pref as any)?.securityAlerts ?? true,
      systemUpdates: (pref as any)?.systemUpdates ?? false,
      weeklyDigest: (pref as any)?.weeklyDigest ?? false,
    };
  }

  async updatePreferences(
    userId: string,
    data: NotificationPreferencesData,
  ): Promise<NotificationPreferencesData> {
    const updated = await this.repo.updatePreferences(userId, data);
    return {
      emailAlerts: (updated as any).emailAlerts ?? true,
      securityAlerts: (updated as any).securityAlerts ?? true,
      systemUpdates: (updated as any).systemUpdates ?? false,
      weeklyDigest: (updated as any).weeklyDigest ?? false,
    };
  }

  async dispatchNotification(dto: SendNotificationDTO) {
    const prefs = await this.getPreferences(dto.userId);
    if (!(prefs as any)[dto.category]) {
      return { skipped: true, reason: 'Category disabled in user preferences' };
    }

    const results: Record<string, boolean> = {};

    if (dto.channels.includes('IN_APP')) {
      await this.repo.createNotification(dto.userId, dto.title, dto.message);
      results.IN_APP = true;
    }

    if (dto.channels.includes('EMAIL') && dto.email) {
      await this.repo.createNotification(dto.userId, dto.title, dto.message);
      const sent = await this.emailService!.sendEmail(dto.email, dto.title, dto.message);
      results.EMAIL = sent;
    }

    if (dto.channels.includes('PUSH')) {
      const subs = await this.repo.getPushSubscriptions(dto.userId);
      for (const sub of subs) {
        await this.repo.createNotification(dto.userId, dto.title, dto.message);
        const sent = await this.pushService!.sendPushNotification(
          {
            endpoint: (sub as any).endpoint,
            keys: { p256dh: (sub as any).p256dh, auth: (sub as any).auth },
          },
          { title: dto.title, message: dto.message },
        );
        results.PUSH = sent;
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

  async getHistory(userId: string, page = 1, limit = 20) {
    return this.repo.getUserNotifications(userId, page, limit);
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
}
