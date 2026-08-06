import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { PresenceTracker } from './presence';
import { CalendarEventBus, CALENDAR_EVENTS } from '../calendar.events';

export class CalendarWebSocketServer {
  private io: Server;
  private presence: PresenceTracker = new PresenceTracker();

  constructor(server: HTTPServer) {
    this.io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      path: '/ws/calendar',
    });

    this.setupAuth();
    this.setupConnectionHandlers();
    this.bindDomainEvents();
  }

  private setupAuth(): void {
    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) return next(new Error('Authentication failed: Missing token'));

      try {
        const decoded = jwt.verify(
          token as string,
          process.env.JWT_SECRET || 'fallback-secret',
        ) as any;
        socket.data.user = decoded;
        next();
      } catch {
        next(new Error('Authentication failed: Invalid signature'));
      }
    });
  }

  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.user.id;
      this.presence.addUser(userId, socket.id);
      socket.join(`user:${userId}`);

      socket.on('join:calendar', (calendarId: string) => {
        socket.join(`calendar:${calendarId}`);
      });

      socket.on('leave:calendar', (calendarId: string) => {
        socket.leave(`calendar:${calendarId}`);
      });

      socket.on('disconnect', () => {
        this.presence.removeUser(userId, socket.id);
      });
    });
  }

  private bindDomainEvents(): void {
    Object.values(CALENDAR_EVENTS).forEach((eventName) => {
      CalendarEventBus.on(
        eventName,
        (payload: { calendarId?: string; userId?: string; data: any }) => {
          if (payload.calendarId) {
            this.io.to(`calendar:${payload.calendarId}`).emit(eventName, payload.data);
          } else if (payload.userId) {
            this.io.to(`user:${payload.userId}`).emit(eventName, payload.data);
          }
        },
      );
    });
  }
}
