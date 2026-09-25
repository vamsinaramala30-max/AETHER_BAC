import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../database/client';

const router = Router();

router.use(authenticate);

interface PlannerBlock {
  id: string;
  start: number;
  duration: number;
  label: string;
  bucket: 'study' | 'other';
  kind: 'fixed' | 'flexible';
  subject: string | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | null;
  energy: 'high' | 'medium' | 'low' | null;
  revision: { stage: 1 | 4 | 7 } | null;
  groupId: string | null;
  completed: boolean;
  taskId?: string | null;
  calendarEventId?: string | null;
}

interface DayData {
  sleepStart?: number;
  sleepEnd?: number;
  blocks: PlannerBlock[];
}

type DaysData = Record<string, DayData>;

// GET /planner — fetch complete weekly planner data
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const displayPrefs = (settings?.displayPreferences as Record<string, any>) || {};
    const weeklyPlanner = displayPrefs.weeklyPlanner || {};
    const daysData: DaysData = weeklyPlanner.daysData || {};

    res.status(200).json({
      success: true,
      data: {
        daysData,
        updatedAt: weeklyPlanner.updatedAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /planner/week — fetch planner data for a specific 7-day range
router.get('/week', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { start } = req.query; // Expects YYYY-MM-DD
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const displayPrefs = (settings?.displayPreferences as Record<string, any>) || {};
    const allDays: DaysData = displayPrefs.weeklyPlanner?.daysData || {};

    let filteredDays: DaysData = allDays;
    if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
      filteredDays = {};
      const startDate = new Date(start);
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        if (allDays[key]) {
          filteredDays[key] = allDays[key];
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        daysData: filteredDays,
        updatedAt: displayPrefs.weeklyPlanner?.updatedAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /planner — replace/upsert full planner state
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const incomingDays = req.body.daysData || {};

    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const currentPrefs = (settings?.displayPreferences as Record<string, any>) || {};
    const updatedPlanner = {
      daysData: incomingDays,
      updatedAt: new Date().toISOString(),
    };
    const updatedPrefs = { ...currentPrefs, weeklyPlanner: updatedPlanner };

    await db.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        displayPreferences: updatedPrefs as any,
      },
      update: {
        displayPreferences: updatedPrefs as any,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        daysData: incomingDays,
        updatedAt: updatedPlanner.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /planner/day/:key — update or save data for a specific day
router.put('/day/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { key } = req.params;
    const incomingDay: DayData = req.body.dayData || { blocks: [] };

    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const currentPrefs = (settings?.displayPreferences as Record<string, any>) || {};
    const currentPlanner = currentPrefs.weeklyPlanner || { daysData: {} };
    const currentDays = currentPlanner.daysData || {};

    const updatedDays: DaysData = {
      ...currentDays,
      [key]: incomingDay,
    };

    const updatedPlanner = {
      daysData: updatedDays,
      updatedAt: new Date().toISOString(),
    };
    const updatedPrefs = { ...currentPrefs, weeklyPlanner: updatedPlanner };

    await db.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        displayPreferences: updatedPrefs as any,
      },
      update: {
        displayPreferences: updatedPrefs as any,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        key,
        dayData: incomingDay,
        updatedAt: updatedPlanner.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const plannerRoutes: Router = router;
