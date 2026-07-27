import { db } from '../../database/client';
import { logger } from '../../config';
import { CronTaskDefinition } from '../scheduler';

export const databaseCleanupCron: CronTaskDefinition = {
  name: 'database:cleanup_sessions',
  expression: '0 1 * * *', // Daily at 1:00 AM
  handler: async () => {
    logger.info('[Cron:Database] Running expired sessions cleanup...');
    const result = await db.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    logger.info(`[Cron:Database] Purged ${result.count} expired sessions.`);
  },
};
