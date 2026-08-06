import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../database/client';

const router = Router();

router.use(authenticate);

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

// GET /calendar/events — fetch all calendar events for authenticated user
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const events = await db.calendarEvent.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startDate: 'asc' },
    });

    const mapped = events.map((e) => ({
      id: e.id,
      calendarId: e.projectId ? '' : '',  // client resolves via its calendarId lookup
      title: e.title,
      start: e.startDate.toISOString(),
      end: e.endDate.toISOString(),
      isAllDay: e.allDay,
      location: e.location,
      description: e.description,
      color: e.color || '#38bdf8',
      status: 'confirmed',
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
    }));

    res.status(200).json({ data: mapped });
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

    const { title, start, end, isAllDay, color, location, description, projectId, taskId, calendarId } = req.body;

    // Resolve calendarId back to a UserCalendar if provided
    let resolvedCalendarId: string | null = null;
    if (calendarId) {
      const cal = await db.userCalendar.findFirst({ where: { id: calendarId, userId } });
      resolvedCalendarId = cal?.id || null;
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
      },
    });

    res.status(201).json({
      data: {
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
        organizer: {
          id: userId,
          displayName: req.user?.fullName || req.user?.email || 'User',
          email: req.user?.email || '',
        },
        projectId: created.projectId,
        taskId: created.taskId,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
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
    const { title, start, end, isAllDay, color, location, description } = req.body;

    const updated = await db.calendarEvent.updateMany({
      where: { id, userId },
      data: {
        ...(title !== undefined && { title }),
        ...(start && { startDate: new Date(start) }),
        ...(end && { endDate: new Date(end) }),
        ...(isAllDay !== undefined && { allDay: !!isAllDay }),
        ...(color !== undefined && { color }),
        ...(location !== undefined && { location }),
        ...(description !== undefined && { description }),
      },
    });

    if (updated.count === 0) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const item = await db.calendarEvent.findUnique({ where: { id } });
    res.status(200).json({ data: item });
  } catch (err) {
    next(err);
  }
});

// DELETE /calendar/events/:id — soft-delete a calendar event
router.delete('/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await db.calendarEvent.updateMany({
      where: { id, userId },
      data: { deletedAt: new Date() },
    });

    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export const calendarApiRoutes: Router = router;
