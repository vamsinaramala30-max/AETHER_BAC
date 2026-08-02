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

    const events = await (this.prisma as any).event.findMany({
      where: {
        startTime: { gte: now, lte: lookahead },
        reminders: { some: {} },
      },
      include: { reminders: true, participants: true },
    });

    for (const event of events) {
      for (const reminder of event.reminders) {
        const triggerTime = new Date(event.startTime.getTime() - reminder.minutes * 60 * 1000);
        if (Math.abs(triggerTime.getTime() - now.getTime()) <= 60000) {
          for (const participant of event.participants) {
            await this.notificationService.dispatchInAppNotification(
              participant.userId,
              event.id,
              `Upcoming Event: "${event.title}" starts in ${reminder.minutes} minutes.`,
            );
          }
        }
      }
    }
  }
}
