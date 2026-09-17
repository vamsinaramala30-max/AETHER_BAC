import { PrismaClient } from '@prisma/client';
import { EventRepository } from '../../../workspace/calendar/events/event.repository';
import { EventService } from '../../../workspace/calendar/events/event.service';
import { CalendarRepository } from '../../../workspace/calendar/calendar.repository';
import { logger } from '../../../../config';

export class CalendarAdapter {
  private eventService: EventService;

  constructor(prisma: PrismaClient) {
    const eventRepo = new EventRepository(prisma);
    const calRepo = new CalendarRepository(prisma);
    this.eventService = new EventService(eventRepo, calRepo);
  }

  public async createEvent(params: {
    workspaceId: string;
    userId: string;
    title: string;
    description?: string;
    startDate: string | Date;
    endDate: string | Date;
    location?: string;
    allDay?: boolean;
  }) {
    logger.info(
      `[CalendarAdapter] Creating calendar event '${params.title}' for user ${params.userId}`,
    );
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);

    return this.eventService.createEvent(params.userId, {
      calendarId: params.workspaceId,
      title: params.title,
      description: params.description,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      location: params.location,
      isAllDay: params.allDay ?? false,
      status: 'CONFIRMED',
      timeZone: 'UTC',
      visibility: 'PUBLIC',
    });
  }

  public async createReminder(params: {
    workspaceId: string;
    userId: string;
    title: string;
    reminderTime: string | Date;
  }) {
    logger.info(`[CalendarAdapter] Creating reminder '${params.title}' at ${params.reminderTime}`);
    const time = new Date(params.reminderTime);

    return this.eventService.createEvent(params.userId, {
      calendarId: params.workspaceId,
      title: `[Reminder] ${params.title}`,
      startTime: time.toISOString(),
      endTime: new Date(time.getTime() + 15 * 60000).toISOString(),
      isAllDay: false,
      status: 'CONFIRMED',
      timeZone: 'UTC',
      visibility: 'PUBLIC',
    });
  }
}
