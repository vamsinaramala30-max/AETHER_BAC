import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../config';

export interface CronTaskDefinition {
  name: string;
  expression: string;
  handler: () => Promise<void>;
  enabled?: boolean;
}

export class CronScheduler {
  private static instance: CronScheduler;
  private tasks: Map<string, ScheduledTask> = new Map();

  private constructor() {}

  public static getInstance(): CronScheduler {
    if (!CronScheduler.instance) {
      CronScheduler.instance = new CronScheduler();
    }
    return CronScheduler.instance;
  }

  /**
   * Schedules a cron task based on standard cron syntax.
   */
  public schedule(taskDef: CronTaskDefinition): void {
    if (taskDef.enabled === false) {
      logger.info(`[CronScheduler] Task '${taskDef.name}' is disabled. Skipping registration.`);
      return;
    }

    if (!cron.validate(taskDef.expression)) {
      throw new Error(`[CronScheduler] Invalid cron expression '${taskDef.expression}' for task '${taskDef.name}'`);
    }

    if (this.tasks.has(taskDef.name)) {
      this.unschedule(taskDef.name);
    }

    const scheduledTask = cron.schedule(taskDef.expression, async () => {
      logger.info(`[Cron] Executing task '${taskDef.name}'...`);
      const start = Date.now();
      try {
        await taskDef.handler();
        const duration = Date.now() - start;
        logger.info(`[Cron] Task '${taskDef.name}' completed in ${duration}ms.`);
      } catch (error) {
        logger.error(`[Cron] Error executing task '${taskDef.name}':`, error);
      }
    });

    this.tasks.set(taskDef.name, scheduledTask);
    logger.info(`[CronScheduler] Registered task '${taskDef.name}' [${taskDef.expression}]`);
  }

  /**
   * Unschedules a task by name.
   */
  public unschedule(name: string): boolean {
    const task = this.tasks.get(name);
    if (task) {
      task.stop();
      this.tasks.delete(name);
      logger.info(`[CronScheduler] Unscheduled task '${name}'.`);
      return true;
    }
    return false;
  }

  /**
   * Stops all active cron tasks.
   */
  public stopAll(): void {
    this.tasks.forEach((task, name) => {
      task.stop();
      logger.info(`[CronScheduler] Stopped task '${name}'.`);
    });
    this.tasks.clear();
  }
}

export const cronScheduler = CronScheduler.getInstance();