import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

import { CalendarRepository } from './modules/workspace/calendar/calendar.repository';
import { CalendarService } from './modules/workspace/calendar/calendar.service';
import { CalendarController } from './modules/workspace/calendar/calendar.controller';
import { createCalendarRouter } from './modules/workspace/calendar/calendar.routes';

import { EventRepository } from './modules/workspace/calendar/events/event.repository';
import { EventService } from './modules/workspace/calendar/events/event.service';
import { EventController } from './modules/workspace/calendar/events/event.controller';
import { createEventRouter } from './modules/workspace/calendar/events/event.routes';

import { SearchService } from './modules/workspace/calendar/search/search.service';
import { SearchController } from './modules/workspace/calendar/search/search.controller';
import { createSearchRouter } from './modules/workspace/calendar/search/search.routes';

import { SyncService } from './modules/workspace/calendar/sync/sync.service';
import { SyncController } from './modules/workspace/calendar/sync/sync.controller';
import { createSyncRouter } from './modules/workspace/calendar/sync/sync.routes';

import { NotificationController } from './modules/workspace/calendar/notifications/notification.controller';
import { createNotificationRouter } from './modules/workspace/calendar/notifications/notification.routes';

import { NotificationService } from './modules/workspace/calendar/events/notification.service';
import { ReminderScheduler } from './modules/workspace/calendar/events/reminder.scheduler';
import { ReminderJob } from './modules/workspace/calendar/jobs/reminder.job';
import { CleanupJob } from './modules/workspace/calendar/jobs/cleanup.job';
import { JobScheduler } from './modules/workspace/calendar/jobs/scheduler';

export function createApp(prisma: PrismaClient): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Global Rate Limiter
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Authentication Middleware
  const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      (req as any).user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired JWT token' });
    }
  };

  // Instantiations
  const calenderRepo = new CalendarRepository(prisma);
  const eventRepo = new EventRepository(prisma);

  const calenderService = new CalendarService(calenderRepo);
  const eventService = new EventService(eventRepo, calenderRepo);
  const searchService = new SearchService(prisma);
  const syncService = new SyncService(prisma);

  const calenderController = new CalendarController(calenderService);
  const eventController = new EventController(eventService);
  const searchController = new SearchController(searchService);
  const syncController = new SyncController(syncService);
  const notificationController = new NotificationController(prisma);

  // Scheduler Setup
  const notificationService = new NotificationService(prisma);
  const reminderScheduler = new ReminderScheduler(prisma, notificationService);
  const reminderJob = new ReminderJob(reminderScheduler);
  const cleanupJob = new CleanupJob(prisma);
  const jobScheduler = new JobScheduler(reminderJob, cleanupJob);
  jobScheduler.start();

  // Route Registrations
  app.use('/workspace/calendar', authMiddleware, createCalendarRouter(calenderController));
  app.use('/workspace/calendar/events', authMiddleware, createEventRouter(eventController));
  app.use('/workspace/calendar/search', authMiddleware, createSearchRouter(searchController));
  app.use('/workspace/calendar/sync', authMiddleware, createSyncRouter(syncController));
  app.use(
    '/workspace/calendar/notifications',
    authMiddleware,
    createNotificationRouter(notificationController),
  );

  // Global Error Handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[Unhandled Engine Error]: ${err.stack}`);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  });

  return app;
}
