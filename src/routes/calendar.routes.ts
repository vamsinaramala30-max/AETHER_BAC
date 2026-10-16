import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../database/client';
import { emitToWorkspace, emitToUser } from '../websocket/socket';
import { SocketEvent } from '../websocket/socketTypes';
import { SyncService } from '../modules/workspace/calendar/sync/sync.service';
import { SyncController } from '../modules/workspace/calendar/sync/sync.controller';
import { createSyncRouter } from '../modules/workspace/calendar/sync/sync.routes';

const router = Router();

router.use(authenticate);

const syncService = new SyncService(db);
const syncController = new SyncController(syncService);
router.use('/sync', createSyncRouter(syncController));

// Default calendar definitions — created once per user on first access
const DEFAULT_CALENDARS = [
  { title: 'Personal', color: '#38bdf8', isPrimary: true },
  { title: 'Work & Projects', color: '#a855f7', isPrimary: false },
  { title: 'AI & Learning', color: '#22c55e', isPrimary: false },
];

async function ensureDefaultCalendars(userId: string): Promise<void> {
  const count = await db.userCalendar.count({ where: { userId } });
  if (count === 0) {
    await db.userCalendar.createMany({
      data: DEFAULT_CALENDARS.map((cal) => ({
        userId,
        title: cal.title,
        color: cal.color,
        isPrimary: cal.isPrimary,
        isVisible: true,
      })),
    });
  }
}

// GET /calendar — list user's calendars (auto-seeds defaults on first call)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    await ensureDefaultCalendars(userId);

    const calendars = await db.userCalendar.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const mapped = calendars.map((c) => ({
      id: c.id,
      title: c.title,
      color: c.color,
      isPrimary: c.isPrimary,
      isVisible: c.isVisible,
      accessLevel: 'owner',
      ownerId: userId,
      timeZone: c.timeZone,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    res.status(200).json({ data: mapped });
  } catch (err) {
    next(err);
  }
});

// POST /calendar — create a new calendar category
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { title, color, timeZone } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const membership = await db.workspaceMember.findFirst({ where: { userId } });

    const calendar = await db.userCalendar.create({
      data: {
        userId,
        workspaceId: membership?.workspaceId || null,
        title,
        color: color || '#38bdf8',
        isPrimary: false,
        isVisible: true,
        timeZone: timeZone || 'UTC',
      },
    });

    res.status(201).json({
      data: {
        id: calendar.id,
        title: calendar.title,
        color: calendar.color,
        isPrimary: calendar.isPrimary,
        isVisible: calendar.isVisible,
        accessLevel: 'owner',
        ownerId: userId,
        timeZone: calendar.timeZone,
        createdAt: calendar.createdAt.toISOString(),
        updatedAt: calendar.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /calendar/:id — update a calendar
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { title, color, isVisible, timeZone } = req.body;

    const updated = await db.userCalendar.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        ...(title !== undefined && { title }),
        ...(color !== undefined && { color }),
        ...(isVisible !== undefined && { isVisible }),
        ...(timeZone !== undefined && { timeZone }),
      },
    });

    if (updated.count === 0) {
      res.status(404).json({ error: 'Calendar not found' });
      return;
    }

    const item = await db.userCalendar.findUnique({ where: { id } });
    res.status(200).json({ data: item });
  } catch (err) {
    next(err);
  }
});

// DELETE /calendar/:id — soft-delete a calendar
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Prevent deleting the primary calendar
    const calendar = await db.userCalendar.findFirst({ where: { id, userId } });
    if (!calendar) {
      res.status(404).json({ error: 'Calendar not found' });
      return;
    }
    if (calendar.isPrimary) {
      res.status(400).json({ error: 'Cannot delete the primary calendar' });
      return;
    }

    await db.userCalendar.updateMany({
      where: { id, userId },
      data: { deletedAt: new Date() },
    });

    res.status(200).json({ message: 'Calendar deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /calendar/events — fetch all calendar events for authenticated user with optional window filtering
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    await ensureDefaultCalendars(userId);

    const calendars = await db.userCalendar.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const primaryCal = calendars.find((c) => c.isPrimary) || calendars[0];
    const defaultCalId = primaryCal?.id || '';
    const calMap = new Map(calendars.map((c) => [c.id, c.id]));

    const { start, end } = req.query;
    const where: any = { userId, deletedAt: null };
    if (start && typeof start === 'string') {
      const s = new Date(start);
      if (!isNaN(s.getTime())) {
        where.endDate = { gte: s };
      }
    }
    if (end && typeof end === 'string') {
      const e = new Date(end);
      if (!isNaN(e.getTime())) {
        where.startDate = { lte: e };
      }
    }

    const events = await db.calendarEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });

    const mapped = events.map((e) => {
      let resolvedCalId = defaultCalId;
      if (e.reminders && typeof e.reminders === 'object' && (e.reminders as any).calendarId) {
        const storedId = (e.reminders as any).calendarId;
        if (calMap.has(storedId)) {
          resolvedCalId = storedId;
        }
      }

      let parsedRecurrenceRule: any = undefined;
      if (e.recurrence) {
        try {
          parsedRecurrenceRule = JSON.parse(e.recurrence);
        } catch {
          parsedRecurrenceRule = undefined;
        }
      }

      return {
        id: e.id,
        calendarId: resolvedCalId,
        title: e.title,
        start: e.startDate.toISOString(),
        end: e.endDate.toISOString(),
        isAllDay: e.allDay,
        location: e.location,
        description: e.description,
        color: e.color || '#38bdf8',
        status: 'confirmed',
        recurrence: e.recurrence || undefined,
        recurrenceRule: parsedRecurrenceRule,
        organizer: {
          id: userId,
          displayName: req.user?.fullName || req.user?.email || 'User',
          email: req.user?.email || '',
          role: 'organizer',
        },
        projectId: e.projectId,
        taskId: e.taskId,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      };
    });

    res.status(200).json({ data: mapped });
  } catch (err) {
    next(err);
  }
});

// GET /calendar/:id — fetch a single calendar category
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const calendar = await db.userCalendar.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!calendar) {
      res.status(404).json({ error: 'Calendar not found' });
      return;
    }

    res.status(200).json({
      data: {
        id: calendar.id,
        title: calendar.title,
        color: calendar.color,
        isPrimary: calendar.isPrimary,
        isVisible: calendar.isVisible,
        accessLevel: 'owner',
        ownerId: userId,
        timeZone: calendar.timeZone,
        createdAt: calendar.createdAt.toISOString(),
        updatedAt: calendar.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /calendar/events — create a calendar event
router.post('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const membership = await db.workspaceMember.findFirst({ where: { userId } });
    const workspaceId = req.user?.workspaceId || membership?.workspaceId;

    if (!workspaceId) {
      res.status(400).json({ error: 'Workspace ID required' });
      return;
    }

    const {
      title,
      start,
      end,
      isAllDay,
      color,
      location,
      description,
      projectId,
      taskId,
      calendarId,
      reminders,
      recurrence,
      recurrenceRule,
    } = req.body;

    await ensureDefaultCalendars(userId);
    const calendars = await db.userCalendar.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const primaryCal = calendars.find((c) => c.isPrimary) || calendars[0];
    let resolvedCalendarId: string = primaryCal?.id || '';

    if (calendarId) {
      const cal = calendars.find((c) => c.id === calendarId);
      if (cal) {
        resolvedCalendarId = cal.id;
      }
    }

    if (taskId) {
      const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null } });
      if (!task) {
        res.status(404).json({ error: 'Linked task not found' });
        return;
      }
      const isOwnerOrAssignee = task.creatorId === userId || task.assigneeId === userId;
      if (!isOwnerOrAssignee) {
        const mem = await db.workspaceMember.findFirst({ where: { workspaceId: task.workspaceId, userId } });
        if (!mem) {
          res.status(403).json({ error: 'Forbidden: unauthorized task association' });
          return;
        }
      }
    }

    let recurrenceStr: string | null = null;
    if (recurrence && typeof recurrence === 'string') {
      recurrenceStr = recurrence;
    } else if (recurrenceRule) {
      recurrenceStr = typeof recurrenceRule === 'string' ? recurrenceRule : JSON.stringify(recurrenceRule);
    }

    const created = await db.calendarEvent.create({
      data: {
        userId,
        workspaceId,
        title: title || 'Untitled Event',
        startDate: start ? new Date(start) : new Date(),
        endDate: end ? new Date(end) : new Date(Date.now() + 3600000),
        allDay: !!isAllDay,
        color: color || '#38bdf8',
        location: location || null,
        description: description || null,
        projectId: projectId || null,
        taskId: taskId || null,
        recurrence: recurrenceStr,
        reminders: {
          ...(typeof reminders === 'object' && reminders !== null ? reminders : {}),
          calendarId: resolvedCalendarId,
        },
      },
    });

    let createdParsedRule: any = undefined;
    if (created.recurrence) {
      try {
        createdParsedRule = JSON.parse(created.recurrence);
      } catch {
        createdParsedRule = undefined;
      }
    }

    const eventPayload = {
      id: created.id,
      calendarId: resolvedCalendarId,
      title: created.title,
      start: created.startDate.toISOString(),
      end: created.endDate.toISOString(),
      isAllDay: created.allDay,
      location: created.location,
      description: created.description,
      color: created.color,
      status: 'confirmed',
      recurrence: created.recurrence || undefined,
      recurrenceRule: createdParsedRule,
      organizer: {
        id: userId,
        displayName: req.user?.fullName || req.user?.email || 'User',
        email: req.user?.email || '',
      },
      projectId: created.projectId,
      taskId: created.taskId,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    emitToUser(userId, SocketEvent.CALENDAR_CREATED, eventPayload);
    if (workspaceId) {
      emitToWorkspace(workspaceId, SocketEvent.CALENDAR_CREATED, eventPayload);
    }

    res.status(201).json({
      data: eventPayload,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /calendar/events/:id — update a calendar event
router.patch('/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      title,
      start,
      end,
      isAllDay,
      color,
      location,
      description,
      calendarId,
      reminders,
      taskId,
      recurrence,
      recurrenceRule,
    } = req.body;

    const existing = await db.calendarEvent.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (taskId) {
      const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null } });
      if (!task) {
        res.status(404).json({ error: 'Linked task not found' });
        return;
      }
      const isOwnerOrAssignee = task.creatorId === userId || task.assigneeId === userId;
      if (!isOwnerOrAssignee) {
        const mem = await db.workspaceMember.findFirst({ where: { workspaceId: task.workspaceId, userId } });
        if (!mem) {
          res.status(403).json({ error: 'Forbidden: unauthorized task association' });
          return;
        }
      }
    }

    let updatedReminders: Record<string, any> =
      typeof existing.reminders === 'object' && existing.reminders !== null
        ? { ...(existing.reminders as Record<string, any>) }
        : {};

    if (typeof reminders === 'object' && reminders !== null) {
      updatedReminders = { ...updatedReminders, ...reminders };
    }
    if (calendarId) {
      const cal = await db.userCalendar.findFirst({
        where: { id: calendarId, userId, deletedAt: null },
      });
      if (cal) {
        updatedReminders.calendarId = cal.id;
      }
    }

    let recurrenceUpdate: string | null | undefined = undefined;
    if (recurrence !== undefined) {
      recurrenceUpdate = recurrence;
    } else if (recurrenceRule !== undefined) {
      recurrenceUpdate =
        recurrenceRule === null
          ? null
          : typeof recurrenceRule === 'string'
          ? recurrenceRule
          : JSON.stringify(recurrenceRule);
    }

    const updated = await db.calendarEvent.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(start && { startDate: new Date(start) }),
        ...(end && { endDate: new Date(end) }),
        ...(isAllDay !== undefined && { allDay: !!isAllDay }),
        ...(color !== undefined && { color }),
        ...(location !== undefined && { location }),
        ...(description !== undefined && { description }),
        ...(taskId !== undefined && { taskId: taskId || null }),
        ...(recurrenceUpdate !== undefined && { recurrence: recurrenceUpdate }),
        reminders: updatedReminders,
      },
    });

    const primaryCal = await db.userCalendar.findFirst({
      where: { userId, isPrimary: true, deletedAt: null },
    });
    const resolvedCalId = updatedReminders.calendarId || primaryCal?.id || '';

    let updatedParsedRule: any = undefined;
    if (updated.recurrence) {
      try {
        updatedParsedRule = JSON.parse(updated.recurrence);
      } catch {
        updatedParsedRule = undefined;
      }
    }

    const updatedPayload = {
      id: updated.id,
      calendarId: resolvedCalId,
      title: updated.title,
      start: updated.startDate.toISOString(),
      end: updated.endDate.toISOString(),
      isAllDay: updated.allDay,
      location: updated.location,
      description: updated.description,
      color: updated.color,
      status: 'confirmed',
      recurrence: updated.recurrence || undefined,
      recurrenceRule: updatedParsedRule,
      organizer: {
        id: userId,
        displayName: req.user?.fullName || req.user?.email || 'User',
        email: req.user?.email || '',
      },
      projectId: updated.projectId,
      taskId: updated.taskId,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    emitToUser(userId, SocketEvent.CALENDAR_UPDATED, updatedPayload);
    if (updated.workspaceId) {
      emitToWorkspace(updated.workspaceId, SocketEvent.CALENDAR_UPDATED, updatedPayload);
    }

    res.status(200).json({
      data: updatedPayload,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /calendar/events/:id — soft-delete a calendar event
router.delete('/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.calendarEvent.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Atomically soft-delete calendar event and unlink from planner blocks
    await db.$transaction([
      db.calendarEvent.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      db.plannerBlock.updateMany({
        where: { calendarEventId: id },
        data: { calendarEventId: null },
      }),
    ]);

    emitToUser(userId, SocketEvent.CALENDAR_DELETED, { id });
    if (existing.workspaceId) {
      emitToWorkspace(existing.workspaceId, SocketEvent.CALENDAR_DELETED, { id });
      emitToWorkspace(existing.workspaceId, SocketEvent.PLANNER_UPDATED, { unlinkedCalendarEventId: id });
    }

    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export const calendarApiRoutes: Router = router;
