import { PrismaClient } from '@prisma/client';
import { NotificationService } from './notification.service';

export class ReminderScheduler {
  constructor(
    private prisma: PrismaClient,
    private notificationService: NotificationService,
  ) {}

  async evaluatePendingReminders(): Promise<void> {
    const now = new Date();
    const lookahead = new Date(now.getTime() + 15 * 60 * 1000);

    try {
      if ((this.prisma as any).calendarEvent && typeof (this.prisma as any).calendarEvent.findMany === 'function') {
        const events = await (this.prisma as any).calendarEvent.findMany({
          where: {
            startDate: { gte: now, lte: lookahead },
            deletedAt: null,
          },
        });

        for (const event of events) {
          if (event.reminders && typeof event.reminders === 'object' && Array.isArray((event.reminders as any).items)) {
            for (const reminder of (event.reminders as any).items) {
              const minutes = typeof reminder.minutes === 'number' ? reminder.minutes : 15;
              const triggerTime = new Date(event.startDate.getTime() - minutes * 60 * 1000);
              if (Math.abs(triggerTime.getTime() - now.getTime()) <= 60000) {
                await this.notificationService.dispatchInAppNotification(
                  event.userId,
                  event.id,
                  `Upcoming Event: "${event.title}" starts in ${minutes} minutes.`,
                );
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ReminderScheduler] Evaluation warning: ${err?.message}`);
    }
  }
}
