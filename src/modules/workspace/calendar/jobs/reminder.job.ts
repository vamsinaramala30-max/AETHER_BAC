import { ReminderScheduler } from '../events/reminder.scheduler';

export class ReminderJob {
  constructor(private scheduler: ReminderScheduler) {}

  async run(): Promise<void> {
    await this.scheduler.evaluatePendingReminders();
  }
}