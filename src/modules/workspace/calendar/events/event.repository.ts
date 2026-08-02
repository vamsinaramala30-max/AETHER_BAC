import { PrismaClient } from '@prisma/client';

// Using `any` casts because calendar-specific Prisma models (event, eventRecurrence, etc.)
// are separate schema extensions not in the main prisma/schema.prisma
const prismaAny = (p: PrismaClient) => p as any;

export class EventRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: any): Promise<any> {
    const { rrule, participants, reminders, ...eventData } = data;
    return prismaAny(this.prisma).event.create({
      data: {
        ...eventData,
        recurrence: rrule
          ? { create: { rrule, dtstart: eventData.startTime, freq: 'CUSTOM' } }
          : undefined,
        participants: participants ? { createMany: { data: participants } } : undefined,
        reminders: reminders ? { createMany: { data: reminders } } : undefined,
      },
      include: { recurrence: true, participants: true, reminders: true, attachments: true },
    });
  }

  async findById(id: string): Promise<any | null> {
    return prismaAny(this.prisma).event.findUnique({
      where: { id },
      include: {
        recurrence: true,
        participants: true,
        reminders: true,
        attachments: true,
        exceptions: true,
      },
    });
  }

  async findInWindow(calendarIds: string[], start: Date, end: Date): Promise<any[]> {
    return prismaAny(this.prisma).event.findMany({
      where: {
        calendarId: { in: calendarIds },
        OR: [{ startTime: { lte: end }, endTime: { gte: start } }, { recurrence: { isNot: null } }],
      },
      include: { recurrence: true, participants: true, reminders: true, exceptions: true },
    });
  }

  async update(id: string, data: any): Promise<any> {
    const { rrule, participants, reminders, ...eventData } = data;

    return this.prisma.$transaction(async (tx: any) => {
      if (rrule !== undefined) {
        await tx.eventRecurrence.deleteMany({ where: { eventId: id } });
        if (rrule) {
          await tx.eventRecurrence.create({
            data: {
              eventId: id,
              rrule,
              dtstart: eventData.startTime || new Date(),
              freq: 'CUSTOM',
            },
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

  async delete(id: string): Promise<any> {
    return prismaAny(this.prisma).event.delete({ where: { id } });
  }

  async updateParticipantStatus(eventId: string, userId: string, status: any): Promise<void> {
    await prismaAny(this.prisma).eventParticipant.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status },
    });
  }
}
