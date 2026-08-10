import cron from 'node-cron';

export class ScheduleManager {
  /**
   * Validate a cron expression.
   */
  public static isValidCron(cronExpression: string): boolean {
    if (!cronExpression) return false;
    return cron.validate(cronExpression.trim());
  }

  /**
   * Helper to normalize schedule aliases into cron expressions.
   * e.g., 'daily' -> '0 0 * * *'
   */
  public static normalizeSchedule(schedule: string): string {
    if (!schedule) return '0 * * * *';
    const s = schedule.toLowerCase().trim();

    switch (s) {
      case 'hourly':
        return '0 * * * *';
      case 'daily':
        return '0 0 * * *';
      case 'weekly':
        return '0 0 * * 0';
      case 'monthly':
        return '0 0 1 * *';
      default:
        return s;
    }
  }
}
