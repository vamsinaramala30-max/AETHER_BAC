import { Queue, Job } from 'bullmq';
import { QueueFactory } from './queue';
import { db } from '../database/client';
import { logger } from '../config';

export interface CleanupJobData {
  olderThanDays: number;
}

export const CLEANUP_QUEUE_NAME = 'system-cleanup';

export const cleanupQueue: Queue<CleanupJobData> =
  QueueFactory.createQueue<CleanupJobData>(CLEANUP_QUEUE_NAME);

export const cleanupWorker = QueueFactory.createWorker<
  CleanupJobData,
  { deletedSessionsCount: number }
>(
  CLEANUP_QUEUE_NAME,
  async (job: Job<CleanupJobData>): Promise<{ deletedSessionsCount: number }> => {
    logger.info(`Running scheduled system cleanup job ${job.id}`);

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - (job.data.olderThanDays || 30));

    const result = await db.session.deleteMany({
      where: {
        expiresAt: {
          lt: thresholdDate,
        },
      },
    });

    return { deletedSessionsCount: result.count };
  },
);
