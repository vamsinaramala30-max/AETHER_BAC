import { jobScheduler } from './jobScheduler';
import { sessionPurgeJob } from './sessionPurge.job';
import { aiCleanupJob } from './aiCleanup.job';
import { analyticsAggregatorJob } from './analyticsAggregator.job';
import { emailRetryJob } from './emailRetry.job';
import { vectorIndexSyncJob } from './vectorIndexSync.job';
import { logger } from '../config';

export class JobRunner {
  /**
   * Initializes and schedules all background cron jobs.
   */
  public static init(): void {
    logger.info('Initializing system background jobs...');

    jobScheduler.registerJob(sessionPurgeJob);
    jobScheduler.registerJob(aiCleanupJob);
    jobScheduler.registerJob(analyticsAggregatorJob);
    jobScheduler.registerJob(emailRetryJob);
    jobScheduler.registerJob(vectorIndexSyncJob);

    logger.info('All system background jobs registered and active.');
  }

  /**
   * Stops all active cron tasks for graceful application teardown.
   */
  public static stopAll(): void {
    logger.info('Stopping all background jobs...');
    jobScheduler.stopAll();
  }
}
