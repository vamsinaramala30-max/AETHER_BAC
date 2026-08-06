import { Server, Socket } from 'socket.io';
import { CalendarRepository } from './calendar.repository';

export interface CalendarEventPayloads {
  'event.created': {
    calendarId: string;
    event: Record<string, any>;
  };
  'event.updated': {
    calendarId: string;
    eventId: string;
    changes: Record<string, any>;
  };
  'event.deleted': {
    calendarId: string;
    eventId: string;
  };
  'reminder.triggered': {
    reminderId: string;
    eventId: string;
    title: string;
    start: Date | string;
  };
  'calendar.updated': {
    calendarId: string;
    changes: Record<string, any>;
  };
  'invitation.sent': {
    eventId: string;
    invitationId: string;
    email: string;
  };
  'invitation.accepted': {
    eventId: string;
    userId: string;
    status: string;
  };
  'sync.completed': {
    syncAccountId: string;
    provider: string;
    status: 'SUCCESS' | 'FAILED';
    message?: string;
  };
}

export type CalendarSocketEventType = keyof CalendarEventPayloads;

export class CalendarWebSocket {
  constructor(
    private io: Server,
    private calendarRepository: CalendarRepository,
  ) {
    this.registerSocketHandlers();
  }

  /**
   * Register base socket connection listener and event handlers
   */
  private registerSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user;
      if (!user || !user.id) {
        socket.disconnect(true);
        return;
      }

      // Auto-join personal user room for direct user-specific events
      const userRoom = `user:${user.id}`;
      socket.join(userRoom);

      /**
       * Room Subscription Handler with RBAC Verification
       */
      socket.on(
        'subscribe:calendar',
        async (calendarId: string, ack?: (res: { success: boolean; error?: string }) => void) => {
          try {
            if (!calendarId || typeof calendarId !== 'string') {
              if (ack) ack({ success: false, error: 'INVALID_CALENDAR_ID' });
              return;
            }

            const role = await this.calendarRepository.getUserRole(calendarId, user.id);
            if (!role) {
              if (ack) ack({ success: false, error: 'UNAUTHORIZED_CALENDAR_ACCESS' });
              return;
            }

            const room = `calendar:${calendarId}`;
            socket.join(room);

            if (ack) ack({ success: true });
          } catch (error: any) {
            if (ack) ack({ success: false, error: error.message || 'SUBSCRIPTION_FAILED' });
          }
        },
      );

      /**
       * Room Unsubscription Handler
       */
      socket.on(
        'unsubscribe:calendar',
        (calendarId: string, ack?: (res: { success: boolean }) => void) => {
          if (calendarId && typeof calendarId === 'string') {
            socket.leave(`calendar:${calendarId}`);
          }
          if (ack) ack({ success: true });
        },
      );

      /**
       * Socket Disconnect
       */
      socket.on('disconnect', (_reason) => {
        // Socket automatically leaves rooms upon disconnect
      });
    });
  }

  /**
   * Broadcast an event update to all subscribers of a specific calendar
   */
  public notifyCalendarUpdate<K extends CalendarSocketEventType>(
    calendarId: string,
    eventType: K,
    payload: CalendarEventPayloads[K],
  ): void {
    const room = `calendar:${calendarId}`;
    this.io.to(room).emit(eventType, {
      eventType,
      calendarId,
      timestamp: new Date().toISOString(),
      data: payload,
    });
  }

  /**
   * Emit an event targeted to a specific user session across all connected sockets/devices
   */
  public notifyUser<K extends CalendarSocketEventType>(
    userId: string,
    eventType: K,
    payload: CalendarEventPayloads[K],
  ): void {
    const room = `user:${userId}`;
    this.io.to(room).emit(eventType, {
      eventType,
      userId,
      timestamp: new Date().toISOString(),
      data: payload,
    });
  }

  /**
   * Emit an event to multiple targeted users (e.g. event invitation updates)
   */
  public notifyUsers<K extends CalendarSocketEventType>(
    userIds: string[],
    eventType: K,
    payload: CalendarEventPayloads[K],
  ): void {
    for (const userId of userIds) {
      this.notifyUser(userId, eventType, payload);
    }
  }
}
