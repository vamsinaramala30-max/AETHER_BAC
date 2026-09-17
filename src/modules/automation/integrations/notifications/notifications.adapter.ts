import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../../../notification/notification.service';
import { NotificationRepository } from '../../../notification/notification.repository';
import { logger } from '../../../../config';

export class NotificationsAdapter {
  private notificationService: NotificationService;

  constructor(_prisma: PrismaClient) {
    const repo = new NotificationRepository();
    this.notificationService = new NotificationService(repo);
  }

  public async createNotification(params: {
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }) {
    logger.info(
      `[NotificationsAdapter] Sending notification '${params.title}' to user '${params.userId}'`,
    );
    return this.notificationService.createNotification({
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: (params.type as any) || 'AUTOMATION',
      link: params.link,
      metadata: params.metadata,
    });
  }

  public async createReminder(params: {
    userId: string;
    title: string;
    message: string;
    link?: string;
  }) {
    logger.info(`[NotificationsAdapter] Sending reminder notification to user '${params.userId}'`);
    return this.createNotification({
      userId: params.userId,
      title: `[Reminder] ${params.title}`,
      message: params.message,
      type: 'AUTOMATION',
      link: params.link,
    });
  }
}
