import { ReminderJob } from './reminder.job';
import { CleanupJob } from './cleanup.job';

export class JobScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(private reminderJob: ReminderJob, private cleanupJob: CleanupJob) {}

  start(intervalMs = 60000): void {
    this.timer = setInterval(async () => {
      try {
        await this.reminderJob.run();
      } catch (err) {
        console.error('Error executing ReminderJob:', err);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}