import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { plannerService } from '../modules/workspace/planner/planner.service';

const router = Router();

router.use(authenticate);

// ============================================================================
// Batch & Weekly Planner Routes (Frontend Compatible)
// ============================================================================

// GET /planner — fetch complete weekly planner data
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const result = await plannerService.getPlanner(userId);
    res.status(200).json({
      success: true,
      data: result,
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
    const result = await plannerService.getWeek(userId, typeof start === 'string' ? start : undefined);
    res.status(200).json({
      success: true,
      data: result,
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
    const result = await plannerService.savePlanner(userId, incomingDays);
    res.status(200).json({
      success: true,
      data: result,
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
    const incomingDay = req.body.dayData || { blocks: [] };
    const result = await plannerService.saveDay(userId, key, incomingDay);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Direct Relational Planner Block CRUD Routes
// ============================================================================

// POST /planner/blocks — create individual block
router.post('/blocks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const block = await plannerService.createBlock(userId, req.body);
    res.status(201).json({
      success: true,
      data: block,
    });
  } catch (err) {
    next(err);
  }
});

// GET /planner/blocks — list blocks with optional dayKey/taskId filter
router.get('/blocks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { dayKey, taskId } = req.query;
    const blocks = await plannerService.listBlocks(userId, {
      dayKey: typeof dayKey === 'string' ? dayKey : undefined,
      taskId: typeof taskId === 'string' ? taskId : undefined,
    });
    res.status(200).json({
      success: true,
      data: blocks,
    });
  } catch (err) {
    next(err);
  }
});

// GET /planner/blocks/:id — get single block
router.get('/blocks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const block = await plannerService.getBlock(userId, req.params.id);
    res.status(200).json({
      success: true,
      data: block,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /planner/blocks/:id or PATCH /planner/blocks/:id — update single block
router.put('/blocks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const block = await plannerService.updateBlock(userId, req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: block,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/blocks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const block = await plannerService.updateBlock(userId, req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: block,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /planner/blocks/:id — delete single block
router.delete('/blocks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    await plannerService.deleteBlock(userId, req.params.id);
    res.status(200).json({
      success: true,
      message: 'Planner block deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

export const plannerRoutes: Router = router;
