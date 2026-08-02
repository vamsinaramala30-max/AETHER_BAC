import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// In-memory fallback dataset for calendar events
let savedCalendars = [
  {
    id: 'cal-personal',
    title: 'Personal',
    color: '#38bdf8',
    isPrimary: true,
    isVisible: true,
    isCustom: false,
    accessLevel: 'owner',
    timeZone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: 'user-1',
    source: 'local',
  },
  {
    id: 'cal-work',
    title: 'Work & Projects',
    color: '#a855f7',
    isPrimary: false,
    isVisible: true,
    isCustom: true,
    accessLevel: 'owner',
    timeZone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: 'user-1',
    source: 'local',
  },
  {
    id: 'cal-ai',
    title: 'AI & Learning',
    color: '#22c55e',
    isPrimary: false,
    isVisible: true,
    isCustom: true,
    accessLevel: 'owner',
    timeZone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: 'user-1',
    source: 'local',
  },
  {
    id: 'cal-reminders',
    title: 'Reminders',
    color: '#f97316',
    isPrimary: false,
    isVisible: true,
    isCustom: true,
    accessLevel: 'owner',
    timeZone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: 'user-1',
    source: 'local',
  },
];

let savedEvents = [
  {
    id: 'evt-all-day-1',
    calendarId: 'cal-ai',
    title: 'Product Roadmap',
    start: '2026-08-03T00:00:00.000Z',
    end: '2026-08-03T23:59:59.000Z',
    isAllDay: true,
    timeZone: 'UTC',
    color: '#059669',
    status: 'confirmed',
    visibility: 'default',
    organizer: {
      id: 'user-1',
      displayName: 'User',
      email: 'user@example.com',
      status: 'accepted',
      role: 'organizer',
    },
    participants: [],
    reminders: [],
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'evt-mon-1',
    calendarId: 'cal-personal',
    title: 'Team Standup',
    start: '2026-08-03T09:00:00.000Z',
    end: '2026-08-03T09:30:00.000Z',
    isAllDay: false,
    timeZone: 'UTC',
    color: '#1d4ed8',
    status: 'confirmed',
    visibility: 'default',
    organizer: {
      id: 'user-1',
      displayName: 'User',
      email: 'user@example.com',
      status: 'accepted',
      role: 'organizer',
    },
    participants: [],
    reminders: [],
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

router.use(authenticate);

// Calendar List & Create
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ data: savedCalendars });
});

router.post('/', (req: Request, res: Response) => {
  const newCal = {
    id: `cal-${Date.now()}`,
    title: req.body.title || 'New Calendar',
    color: req.body.color || '#3b82f6',
    isPrimary: false,
    isVisible: true,
    isCustom: true,
    accessLevel: 'owner',
    timeZone: req.body.timeZone || 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: (req as any).user?.id || 'user-1',
    source: 'local',
  };
  savedCalendars.push(newCal);
  res.status(201).json({ data: newCal });
});

// Event Endpoints
router.get('/events', (_req: Request, res: Response) => {
  res.status(200).json({ data: savedEvents });
});

router.post('/events', (req: Request, res: Response) => {
  const newEvt = {
    id: req.body.id || `evt-${Date.now()}`,
    calendarId: req.body.calendarId || 'cal-personal',
    title: req.body.title || 'Untitled Event',
    start: req.body.start || new Date().toISOString(),
    end: req.body.end || new Date().toISOString(),
    isAllDay: !!req.body.isAllDay,
    timeZone: req.body.timeZone || 'UTC',
    color: req.body.color || '#3b82f6',
    status: req.body.status || 'confirmed',
    visibility: req.body.visibility || 'default',
    organizer: req.body.organizer || {
      id: (req as any).user?.id || 'user-1',
      displayName: 'User',
      email: 'user@example.com',
      status: 'accepted',
      role: 'organizer',
    },
    participants: req.body.participants || [],
    reminders: req.body.reminders || [],
    attachments: req.body.attachments || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  savedEvents.push(newEvt);
  res.status(201).json({ data: newEvt });
});

router.patch('/events/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = savedEvents.findIndex((e) => e.id === id);
  if (idx !== -1) {
    savedEvents[idx] = { ...savedEvents[idx], ...req.body, updatedAt: new Date().toISOString() };
    res.status(200).json({ data: savedEvents[idx] });
  } else {
    res.status(404).json({ error: 'Event not found' });
  }
});

router.delete('/events/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  savedEvents = savedEvents.filter((e) => e.id !== id);
  res.status(200).json({ message: 'Event deleted successfully' });
});

export const calendarApiRoutes: Router = router;
