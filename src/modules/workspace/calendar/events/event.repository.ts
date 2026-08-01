import { PrismaClient, Event } from '@prisma/client';

export class EventRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: any): Promise<Event> {
    const { rrule, participants, reminders, ...eventData } = data;
    return this.prisma.event.create({
      data: {
        ...eventData,
        recurrence: rrule ? { create: { rrule, dtstart: eventData.startTime, freq: 'CUSTOM' } } : undefined,
        participants: participants ? { createMany: { data: participants } } : undefined,
        reminders: reminders ? { createMany: { data: reminders } } : undefined,
      },
      include: { recurrence: true, participants: true, reminders: true, attachments: true },
    });
  }

  async findById(id: string): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
      include: { recurrence: true, participants: true, reminders: true, attachments: true, exceptions: true },
    });
  }

  async findInWindow(calendarIds: string[], start: Date, end: Date): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        calendarId: { in: calendarIds },
        OR: [
          { startTime: { lte: end }, endTime: { gte: start } },
          { recurrence: { isNot: null } },
        ],
      },
      include: { recurrence: true, participants: true, reminders: true, exceptions: true },
    });
  }

  async update(id: string, data: any): Promise<Event> {
    const { rrule, participants, reminders, ...eventData } = data;
    
    return this.prisma.$transaction(async (tx) => {
      if (rrule !== undefined) {
        await tx.eventRecurrence.deleteMany({ where: { eventId: id } });
        if (rrule) {
          await tx.eventRecurrence.create({
            data: { eventId: id, rrule, dtstart: eventData.startTime || new Date(), freq: 'CUSTOM' },
          });
        }
      }

      return tx.event.update({
        where: { id },
        data: eventData,
        include: { recurrence: true, participants: true, reminders: true, attachments: true },
      });
    });
  }

  async delete(id: string): Promise<Event> {
    return this.prisma.event.delete({ where: { id } });
  }

  async updateParticipantStatus(eventId: string, userId: string, status: any): Promise<void> {
    await this.prisma.eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status },
    });
  }
}