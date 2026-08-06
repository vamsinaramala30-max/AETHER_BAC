import { Router, Request, Response, NextFunction } from 'express';
import { automationController } from '../modules/automation/automation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createAutomationSchema, updateAutomationSchema } from '../validators/automation.validator';
import { db } from '../database/client';

const router = Router();

router.use(authenticate);

async function resolveWorkspaceId(req: Request): Promise<string | null> {
  try {
    const headerId = req.headers['x-workspace-id'] as string | undefined;
    if (headerId) return headerId;

    const userId = (req as any).user?.id;
    if (!userId) return null;

    const membership = await db.workspaceMember.findFirst({
      where: { userId },
      select: { workspaceId: true },
    });
    return membership?.workspaceId ?? null;
  } catch {
    return null;
  }
}

// Integrations — user-specific connections only; empty until configured
router.get('/integrations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    res.status(200).json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
});

router.patch('/integrations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    res.status(200).json({
      success: true,
      data: { id: req.params.id, isConnected: Boolean(req.body.isConnected), status: 'Active' },
    });
  } catch (err) {
    next(err);
  }
});

// Scheduled automations from database
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      res.status(200).json({ success: true, data: [] });
      return;
    }
    const automations = await db.automation.findMany({
      where: { workspaceId, deletedAt: null, schedule: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    const data = automations.map((a) => ({
      id: a.id,
      name: a.name,
      schedule: a.schedule,
      status: a.isEnabled ? 'active' : 'paused',
      lastRun: a.lastRunAt?.toISOString() ?? null,
      nextRun: null,
    }));
    res.status(200).json({ success: true, data });
  } catch {
    res.status(200).json({ success: true, data: [] });
  }
});

router.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (await resolveWorkspaceId(req)) || '00000000-0000-0000-0000-000000000000';
    const { name, schedule, cronExpression, target } = req.body;
    const sched = schedule || cronExpression || '0 * * * *';
    const created = await db.automation.create({
      data: {
        workspaceId,
        name: name || 'Operational Schedule',
        trigger: 'CRON_SCHEDULE',
        actions: { target: target || '/v1/tasks/' },
        schedule: sched,
        isEnabled: true,
      },
    });
    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        schedule: created.schedule,
        status: 'active',
        lastRun: null,
        nextRun: null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    if (!workspaceId) {
      res.status(200).json({ success: true, data: [] });
      return;
    }
    const automations = await db.automation.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    res.status(200).json({ success: true, data: automations });
  } catch {
    res.status(200).json({ success: true, data: [] });
  }
});

router.get('/logs', automationController.getLogs.bind(automationController));
router.get('/', automationController.getAutomations.bind(automationController));
router.post('/', validate(createAutomationSchema), automationController.createAutomation.bind(automationController));
router.get('/:id', automationController.getAutomationById.bind(automationController));
router.put('/:id', validate(updateAutomationSchema), automationController.updateAutomation.bind(automationController));
router.patch('/:id', validate(updateAutomationSchema), automationController.updateAutomation.bind(automationController));
router.delete('/:id', automationController.deleteAutomation.bind(automationController));

export const automationRoutes: Router = router;
