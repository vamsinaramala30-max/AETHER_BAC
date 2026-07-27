import { emailQueue } from '../../queues/email.queue';
import { logger } from '../../config';
import { CronTaskDefinition } from '../scheduler';

export const emailRetryCron: CronTaskDefinition = {
  name: 'email:retry_failed',
  expression: '*/10 * * * *', // Every 10 minutes
  handler: async () => {
    logger.info('[Cron:Email] Checking email queue for stuck/failed jobs...');
    const failed = await emailQueue.getFailed();
    for (const job of failed) {
      if (job.attemptsMade < 3) {
        logger.info(`[Cron:Email] Retrying email job ${job.id}`);
        await job.retry();
      }
    }
  },
};
