import { PrismaClient } from '@prisma/client';
import { cronScheduler } from '../../../cron/scheduler';
import { AutomationRepository } from '../repositories/automation.repository';
import { ExecutionEngine } from '../engine/execution-engine';
import { ScheduleManager } from './schedule-manager';
import { logger } from '../../../config';

export class AutomationScheduler {
  private autoRepo: AutomationRepository;
  private executionEngine: ExecutionEngine;

  constructor(prisma: PrismaClient) {
    this.autoRepo = new AutomationRepository();
    this.executionEngine = new ExecutionEngine(prisma);
  }

  /**
   * Initializes all active scheduled automations from database into the CronScheduler.
   */
  public async initializeScheduledAutomations(): Promise<void> {
    try {
      logger.info('[AutomationScheduler] Loading active scheduled automations from database...');
      const automations = await this.autoRepo.findScheduledAutomations();

      for (const auto of automations) {
        this.scheduleAutomation(auto.id, auto.name, auto.schedule);
      }

      logger.info(
        `[AutomationScheduler] Successfully registered ${automations.length} scheduled automations.`,
      );
    } catch (err) {
      logger.error('[AutomationScheduler] Failed to initialize scheduled automations:', err);
    }
  }

  /**
   * Schedules a single automation by ID.
   */
  public scheduleAutomation(id: string, name: string, scheduleRaw?: string | null): void {
    if (!scheduleRaw) return;

    const cronExpr = ScheduleManager.normalizeSchedule(scheduleRaw);

    if (!ScheduleManager.isValidCron(cronExpr)) {
      logger.warn(
        `[AutomationScheduler] Invalid cron expression '${cronExpr}' for automation '${id}' (${name}). Skipping.`,
      );
      return;
    }

    const taskName = `automation_${id}`;

    cronScheduler.schedule({
      name: taskName,
      expression: cronExpr,
      enabled: true,
      handler: async () => {
        logger.info(`[AutomationScheduler] Cron triggered for automation '${id}' (${name})`);
        await this.executionEngine.execute(id, {
          triggeredBy: 'CRON_SCHEDULER',
          schedule: cronExpr,
          timestamp: new Date().toISOString(),
        });
      },
    });
  }

  /**
   * Unschedules an automation task.
   */
  public unscheduleAutomation(id: string): void {
    const taskName = `automation_${id}`;
    cronScheduler.unschedule(taskName);
  }
}
