import { db } from '../database/client';
import { logger } from '../config';
import { ScheduledJob } from './jobScheduler';

export const sessionPurgeJob: ScheduledJob = {
  name: 'SessionPurgeJob',
  cronExpression: '0 2 * * *', // Daily at 02:00 AM
  task: async (): Promise<void> => {
    logger.info('[SessionPurgeJob] Purging expired database sessions...');
    const result = await db.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    logger.info(`[SessionPurgeJob] Successfully purged ${result.count} expired sessions.`);
  },
};