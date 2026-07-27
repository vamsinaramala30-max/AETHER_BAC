import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../config';

export interface ScheduledJob {
  name: string;
  cronExpression: string;
  task: () => Promise<void>;
  enabled?: boolean;
}

export class JobScheduler {
  private static instance: JobScheduler;
  private tasks: Map<string, ScheduledTask> = new Map();

  private constructor() {}

  public static getInstance(): JobScheduler {
    if (!JobScheduler.instance) {
      JobScheduler.instance = new JobScheduler();
    }
    return JobScheduler.instance;
  }

  /**
   * Registers and schedules a recurring cron job.
   */
  public registerJob(job: ScheduledJob): void {
    if (job.enabled === false) {
      logger.info(`[JobScheduler] Job '${job.name}' is disabled. Skipping schedule.`);
      return;
    }

    if (this.tasks.has(job.name)) {
      logger.warn(`[JobScheduler] Job '${job.name}' is already registered. Overwriting schedule.`);
      this.stopJob(job.name);
    }

    const scheduledTask = cron.schedule(job.cronExpression, async () => {
      logger.info(`[JobScheduler] Starting execution for job '${job.name}'...`);
      const startTime = Date.now();
      try {
        await job.task();
        const duration = Date.now() - startTime;
        logger.info(`[JobScheduler] Job '${job.name}' completed successfully in ${duration}ms.`);
      } catch (error) {
        logger.error(`[JobScheduler] Job '${job.name}' failed:`, error);
      }
    });

    this.tasks.set(job.name, scheduledTask);
    logger.info(
      `[JobScheduler] Scheduled job '${job.name}' with schedule '${job.cronExpression}'.`,
    );
  }

  /**
   * Stops a specific scheduled job by name.
   */
  public stopJob(name: string): boolean {
    const task = this.tasks.get(name);
    if (task) {
      task.stop();
      this.tasks.delete(name);
      logger.info(`[JobScheduler] Stopped job '${name}'.`);
      return true;
    }
    return false;
  }

  /**
   * Stops all scheduled background tasks gracefully.
   */
  public stopAll(): void {
    this.tasks.forEach((task, name) => {
      task.stop();
      logger.info(`[JobScheduler] Stopped scheduled task '${name}'.`);
    });
    this.tasks.clear();
  }
}

export const jobScheduler = JobScheduler.getInstance();
