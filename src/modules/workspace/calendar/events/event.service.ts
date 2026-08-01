import { EventRepository } from './event.repository';
import { CalendarRepository } from '../calendar.repository';
import { CreateEventDTO, UpdateEventDTO } from '../calendar.dto';
import { RecurrenceExpansionEngine } from './recurrence.engine';
import { ConflictDetector } from '../utils/conflict';
import { CalendarEventBus, CALENDAR_EVENTS } from '../calendar.events';
import { ParticipantStatus } from '@prisma/client';

export class EventService {
  constructor(
    private eventRepo: EventRepository,
    private calendarRepo: CalendarRepository
  ) {}

  async createEvent(userId: string, dto: CreateEventDTO) {
    const access = await this.calendarRepo.getUserRole(dto.calendarId, userId);
    if (!access || access === 'READER') {
      throw new Error('Write permissions required for this calendar');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    const existingEvents = await this.eventRepo.findInWindow([dto.calendarId], start, end);
    const conflicts = ConflictDetector.findCollisions(
      { startTime: start, endTime: end },
      existingEvents.map(e => ({ startTime: e.startTime, endTime: e.endTime }))
    );

    if (conflicts.length > 0) {
      // Logic for strict collision prevention or warning propagation
    }

    const event = await this.eventRepo.create({
      ...dto,
      startTime: start,
      endTime: end,
      participants: dto.participants
        ? [{ userId, role: 'ORGANIZER', status: ParticipantStatus.ACCEPTED }, ...dto.participants]
        : [{ userId, role: 'ORGANIZER', status: ParticipantStatus.ACCEPTED }],
    });

    CalendarEventBus.emit(CALENDAR_EVENTS.EVENT_CREATED, {
      calendarId: dto.calendarId,
      data: event,
    });

    return event;
  }

  async getEventsInWindow(userId: string, calendarIds: string[], start: Date, end: Date) {
    for (const calId of calendarIds) {
      const access = await this.calendarRepo.getUserRole(calId, userId);
      if (!access) throw new Error(`Access denied to calendar ${calId}`);
    }

    const rawEvents = await this.eventRepo.findInWindow(calendarIds, start, end);
    const expanded: any[] = [];

    for (const event of rawEvents) {
      expanded.push(...RecurrenceExpansionEngine.expand(event, start, end));
    }

    return expanded;
  }

  async updateEvent(userId: string, eventId: string, dto: UpdateEventDTO) {
    const existing = await this.eventRepo.findById(eventId);
    if (!existing) throw new Error('Event not found');

    const access = await this.calendarRepo.getUserRole(existing.calendarId, userId);
    if (!access || access === 'READER') throw new Error('Write permission denied');

    const updateData: any = { ...dto };
    if (dto.startTime) updateData.startTime = new Date(dto.startTime);
    if (dto.endTime) updateData.endTime = new Date(dto.endTime);

    const updated = await this.eventRepo.update(eventId, updateData);

    CalendarEventBus.emit(CALENDAR_EVENTS.EVENT_UPDATED, {
      calendarId: updated.calendarId,
      data: updated,
    });

    return updated;
  }

  async deleteEvent(userId: string, eventId: string) {
    const existing = await this.eventRepo.findById(eventId);
    if (!existing) throw new Error('Event not found');

    const access = await this.calendarRepo.getUserRole(existing.calendarId, userId);
    if (!access || access === 'READER') throw new Error('Write permission denied');

    const deleted = await this.eventRepo.delete(eventId);

    CalendarEventBus.emit(CALENDAR_EVENTS.EVENT_DELETED, {
      calendarId: deleted.calendarId,
      data: { id: eventId },
    });

    return deleted;
  }

  async respondToInvitation(userId: string, eventId: string, status: ParticipantStatus) {
    await this.eventRepo.updateParticipantStatus(eventId, userId, status);
    CalendarEventBus.emit(CALENDAR_EVENTS.INVITATION_ACCEPTED, {
      userId,
      data: { eventId, status },
    });
  }
}