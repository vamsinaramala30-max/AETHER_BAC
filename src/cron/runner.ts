import { cronScheduler } from './scheduler';
import { databaseCleanupCron } from './tasks/database.cron';
import { analyticsAggregateCron } from './tasks/analytics.cron';
import { emailRetryCron } from './tasks/email.cron';
import { vectorSyncCron } from './tasks/vector.cron';
import { logger } from '../config';

export class CronRunner {
  /**
   * Initializes and registers all system cron tasks.
   */
  public static init(): void {
    logger.info('Initializing cron task runner...');

    cronScheduler.schedule(databaseCleanupCron);
    cronScheduler.schedule(analyticsAggregateCron);
    cronScheduler.schedule(emailRetryCron);
    cronScheduler.schedule(vectorSyncCron);

    logger.info('All cron tasks successfully scheduled.');
  }

  /**
   * Stops all active cron tasks.
   */
  public static stop(): void {
    logger.info('Stopping all active cron tasks...');
    cronScheduler.stopAll();
  }
}
