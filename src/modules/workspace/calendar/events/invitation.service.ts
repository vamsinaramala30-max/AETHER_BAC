import { PrismaClient, ParticipantStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { CalendarEventBus, CALENDAR_EVENTS } from '../calendar.events';

export class InvitationService {
  constructor(private prisma: PrismaClient) {}

  async createInvitation(eventId: string, email: string) {
    const token = uuidv4();
    const invitation = await this.prisma.invitation.create({
      data: { eventId, email, token, status: ParticipantStatus.NEEDS_ACTION },
    });

    CalendarEventBus.emit(CALENDAR_EVENTS.INVITATION_SENT, { data: invitation });
    return invitation;
  }
}