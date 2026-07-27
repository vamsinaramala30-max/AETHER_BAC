import { emailQueue } from '../queues/email.queue';
import { logger } from '../config';
import { ScheduledJob } from './jobScheduler';

export const emailRetryJob: ScheduledJob = {
  name: 'EmailRetryJob',
  cronExpression: '*/15 * * * *', // Every 15 minutes
  task: async (): Promise<void> => {
    logger.info('[EmailRetryJob] Inspecting failed email queue jobs for retry eligibility...');
    const failedJobs = await emailQueue.getFailed();

    for (const job of failedJobs) {
      if (job.attemptsMade < 5) {
        logger.info(
          `[EmailRetryJob] Retrying failed email job ${job.id} (Attempt ${job.attemptsMade + 1})`,
        );
        await job.retry();
      }
    }
  },
};
