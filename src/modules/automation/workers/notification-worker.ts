import { PrismaClient } from '@prisma/client';
import { NotificationsAdapter } from '../integrations/notifications/notifications.adapter';
import { logger } from '../../../config';

export class NotificationWorker {
  private notificationsAdapter: NotificationsAdapter;

  constructor(prisma: PrismaClient) {
    this.notificationsAdapter = new NotificationsAdapter(prisma);
  }

  public async queueNotification(payload: {
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }): Promise<void> {
    setImmediate(async () => {
      try {
        logger.info(`[NotificationWorker] Dispatching async notification to user '${payload.userId}'`);
        await this.notificationsAdapter.createNotification(payload);
      } catch (err) {
        logger.error('[NotificationWorker] Failed to dispatch async notification:', err);
      }
    });
  }
}
