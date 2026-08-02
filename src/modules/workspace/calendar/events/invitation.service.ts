import { PrismaClient } from '@prisma/client';
import { CalendarEventBus, CALENDAR_EVENTS } from '../calendar.events';

// ParticipantStatus not in main Prisma schema — define locally
const ParticipantStatus = {
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  NEEDS_ACTION: 'NEEDS_ACTION',
  TENTATIVE: 'TENTATIVE',
} as const;

export class InvitationService {
  constructor(private prisma: PrismaClient) {}

  async createInvitation(eventId: string, email: string) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const invitation = await (this.prisma as any).invitation.create({
      data: { eventId, email, token, status: ParticipantStatus.NEEDS_ACTION },
    });

    CalendarEventBus.emit(CALENDAR_EVENTS.INVITATION_SENT, { data: invitation });
    return invitation;
  }
}
