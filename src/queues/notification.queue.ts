import { Queue, Job } from 'bullmq';
import { QueueFactory } from './queue';
import { logger } from '../config';

export interface NotificationJobData {
  userId: string;
  title: string;
  message: string;
  channel: 'IN_APP' | 'EMAIL' | 'PUSH';
}

export const NOTIFICATION_QUEUE_NAME = 'notification-dispatch';

export const notificationQueue: Queue<NotificationJobData> = QueueFactory.createQueue<NotificationJobData>(NOTIFICATION_QUEUE_NAME);

export const notificationWorker = QueueFactory.createWorker<NotificationJobData, boolean>(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job<NotificationJobData>): Promise<boolean> => {
    logger.info(`Processing Notification Job ${job.id} for user ${job.data.userId}`);

    // Notification dispatch logic here
    await new Promise((resolve) => setTimeout(resolve, 50));

    return true;
  }
);

