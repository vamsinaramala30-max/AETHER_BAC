import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../database/client';

const router = Router();

router.use(authenticate);

// Default list of user calendars
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const defaultCalendars = [
      {
        id: `cal-personal-${userId}`,
        title: 'Personal',
        color: '#38bdf8',
        isPrimary: true,
        isVisible: true,
        accessLevel: 'owner',
        ownerId: userId,
      },
      {
        id: `cal-work-${userId}`,
        title: 'Work & Projects',
        color: '#a855f7',
        isPrimary: false,
        isVisible: true,
        accessLevel: 'owner',
        ownerId: userId,
      },
      {
        id: `cal-ai-${userId}`,
        title: 'AI & Learning',
        color: '#22c55e',
        isPrimary: false,
        isVisible: true,
        accessLevel: 'owner',
        ownerId: userId,
      },
    ];
    res.status(200).json({ data: defaultCalendars });
  } catch (err) {
    next(err);
  }
});

// Fetch calendar events for authenticated user
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const events = await db.calendarEvent.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startDate: 'asc' },
    });

    const mapped = events.map((e) => ({
      id: e.id,
      calendarId: e.projectId ? `cal-work-${userId}` : `cal-personal-${userId}`,
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

// Create calendar event
router.post('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const membership = await db.workspaceMember.findFirst({ where: { userId } });
    const workspaceId = req.user?.workspaceId || membership?.workspaceId;

    if (!workspaceId) {
      res.status(400).json({ error: 'Workspace ID required' });
      return;
    }

    const { title, start, end, isAllDay, color, location, description, projectId, taskId } = req.body;

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
        calendarId: created.projectId ? `cal-work-${userId}` : `cal-personal-${userId}`,
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
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Update event
router.patch('/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { title, start, end, isAllDay, color, location, description } = req.body;

    const updated = await db.calendarEvent.updateMany({
      where: { id, userId },
      data: {
        title: title !== undefined ? title : undefined,
        startDate: start ? new Date(start) : undefined,
        endDate: end ? new Date(end) : undefined,
        allDay: isAllDay !== undefined ? !!isAllDay : undefined,
        color: color !== undefined ? color : undefined,
        location: location !== undefined ? location : undefined,
        description: description !== undefined ? description : undefined,
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

// Delete event
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
