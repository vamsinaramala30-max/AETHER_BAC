import { EventEmitter } from 'events';

export const CalendarEventBus = new EventEmitter();

export const CALENDAR_EVENTS = {
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_DELETED: 'event.deleted',
  REMINDER_TRIGGERED: 'reminder.triggered',
  CALENDAR_UPDATED: 'calendar.updated',
  INVITATION_SENT: 'invitation.sent',
  INVITATION_ACCEPTED: 'invitation.accepted',
  SYNC_COMPLETED: 'sync.completed',
};