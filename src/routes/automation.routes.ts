import { Router, Request, Response } from 'express';
import { automationController } from '../modules/automation/automation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createAutomationSchema, updateAutomationSchema } from '../validators/automation.validator';

const router = Router();

router.use(authenticate);

// Integrations routes
const mockIntegrations = [
  {
    id: 'int-slack',
    name: 'Slack',
    category: 'Communication',
    isConnected: true,
    status: 'Active',
    icon: 'slack',
  },
  {
    id: 'int-github',
    name: 'GitHub',
    category: 'Developer Tools',
    isConnected: true,
    status: 'Active',
    icon: 'github',
  },
  {
    id: 'int-jira',
    name: 'Jira',
    category: 'Project Management',
    isConnected: false,
    status: 'Inactive',
    icon: 'jira',
  },
  {
    id: 'int-notion',
    name: 'Notion',
    category: 'Knowledge',
    isConnected: false,
    status: 'Inactive',
    icon: 'notion',
  },
];

router.get('/integrations', (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: mockIntegrations });
});

router.patch('/integrations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const item = mockIntegrations.find((i) => i.id === id);
  if (item) {
    item.isConnected = !item.isConnected;
    item.status = item.isConnected ? 'Active' : 'Inactive';
    res.status(200).json({ success: true, data: item });
  } else {
    res.status(200).json({ success: true, data: { id, isConnected: true, status: 'Active' } });
  }
});

// Scheduled Automation Tasks
const mockTasks = [
  {
    id: 'task-1',
    name: 'Nightly Database Sync',
    schedule: '0 0 * * *',
    status: 'active',
    lastRun: '2026-08-02T00:00:00Z',
    nextRun: '2026-08-03T00:00:00Z',
  },
  {
    id: 'task-2',
    name: 'AI Lead Qualification Batch',
    schedule: '*/30 * * * *',
    status: 'active',
    lastRun: '2026-08-02T17:30:00Z',
    nextRun: '2026-08-02T18:00:00Z',
  },
  {
    id: 'task-3',
    name: 'Slack Incident Alert Cleanup',
    schedule: '0 12 * * *',
    status: 'paused',
    lastRun: '2026-08-01T12:00:00Z',
    nextRun: '2026-08-03T12:00:00Z',
  },
];

router.get('/tasks', (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: mockTasks });
});

router.get('/logs', automationController.getLogs);
router.get('/', automationController.getAutomations);
router.post('/', validate(createAutomationSchema), automationController.createAutomation);
router.get('/:id', automationController.getAutomationById);
router.put('/:id', validate(updateAutomationSchema), automationController.updateAutomation);
router.delete('/:id', automationController.deleteAutomation);

export const automationRoutes: Router = router;
