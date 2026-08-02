import { PrismaClient } from '@prisma/client';
import { CalendarEventBus, CALENDAR_EVENTS } from '../calendar.events';

export class NotificationService {
  constructor(private prisma: PrismaClient) {}

  async dispatchInAppNotification(userId: string, eventId: string, message: string) {
    const notification = await (this.prisma as any).eventNotification.create({
      data: { userId, eventId, message },
    });

    CalendarEventBus.emit(CALENDAR_EVENTS.REMINDER_TRIGGERED, {
      userId,
      data: notification,
    });
  }
}
