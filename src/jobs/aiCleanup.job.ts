import { db } from '../database/client';
import { logger } from '../config';
import { ScheduledJob } from './jobScheduler';

export const aiCleanupJob: ScheduledJob = {
  name: 'AICleanupJob',
  cronExpression: '0 3 * * 0', // Weekly every Sunday at 03:00 AM
  task: async (): Promise<void> => {
    logger.info('[AICleanupJob] Cleaning up orphaned temporary AI conversations...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db.conversation.deleteMany({
      where: {
        updatedAt: {
          lt: thirtyDaysAgo,
        },
        messages: {
          none: {},
        },
      },
    });

    logger.info(`[AICleanupJob] Cleaned up ${result.count} empty/orphaned AI conversations.`);
  },
};