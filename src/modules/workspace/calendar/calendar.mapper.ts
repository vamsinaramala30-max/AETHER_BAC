import { CalendarRole, CalendarType, EventStatus, RSVPStatus } from './calendar.types';

export class CalendarMapper {
  static toCalendarResponse(entity: any, currentUserId?: string) {
    const userMember = entity.members?.find((m: any) => m.userId === currentUserId);
    
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      color: entity.color,
      type: entity.type as CalendarType,
      timezone: entity.timezone,
      isPrimary: entity.isPrimary || false,
      ownerId: entity.ownerId,
      myRole: entity.ownerId === currentUserId ? CalendarRole.OWNER : (userMember?.role as CalendarRole || CalendarRole.VIEWER),
      members: entity.members ? entity.members.map((m: any) => ({
        userId: m.userId,
        role: m.role,
        user: m.user ? {
          id: m.user.id,
          email: m.user.email,
          name: m.user.name,
        } : undefined,
      })) : [],
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toEventResponse(entity: any) {
    return {
      id: entity.id,
      calendarId: entity.calendarId,
      title: entity.title,
      description: entity.description,
      startTime: entity.startTime,
      endTime: entity.endTime,
      timezone: entity.timezone,
      isAllDay: entity.isAllDay,
      recurrenceRule: entity.recurrenceRule,
      recurringEventId: entity.recurringEventId,
      originalStart: entity.originalStart,
      status: entity.status as EventStatus,
      location: entity.location ? (typeof entity.location === 'string' ? JSON.parse(entity.location) : entity.location) : null,
      reminders: entity.reminders ? (typeof entity.reminders === 'string' ? JSON.parse(entity.reminders) : entity.reminders) : [],
      attachments: entity.attachments ? entity.attachments.map((a: any) => ({
        id: a.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
      })) : [],
      attendees: entity.attendees ? entity.attendees.map((at: any) => ({
        id: at.id,
        email: at.email,
        name: at.name,
        status: at.status as RSVPStatus,
        isOptional: at.isOptional,
        userId: at.userId,
      })) : [],
      organizer: entity.organizer ? {
        id: entity.organizer.id,
        email: entity.organizer.email,
        name: entity.organizer.name,
      } : null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}