import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

let mockTasks = [
  {
    id: 'task-101',
    title: 'Implement OAuth 2.0 PKCE Flow',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueDate: '2026-08-05',
    createdAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'task-102',
    title: 'Optimize RAG Vector Search Queries',
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: '2026-08-10',
    createdAt: '2026-08-01T11:00:00Z',
  },
  {
    id: 'task-103',
    title: 'Audit Session Token Revocation',
    status: 'COMPLETED',
    priority: 'URGENT',
    dueDate: '2026-08-02',
    createdAt: '2026-07-28T09:00:00Z',
  },
];

let mockGoals = [
  {
    id: 'goal-201',
    title: 'Achieve 99.99% Enterprise Uptime SLA',
    category: 'Infrastructure',
    progress: 85,
    targetDate: '2026-12-31',
  },
  {
    id: 'goal-202',
    title: 'Complete SOC2 Type II Compliance Audit',
    category: 'Security',
    progress: 60,
    targetDate: '2026-10-15',
  },
  {
    id: 'goal-203',
    title: 'Expand AI Workflow Integrations Catalog',
    category: 'Product',
    progress: 40,
    targetDate: '2026-09-30',
  },
];

// Tasks routes
router.get('/tasks', (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: mockTasks });
});

router.post('/tasks', (req: Request, res: Response) => {
  const newTask = {
    id: `task-${Date.now()}`,
    title: req.body.title || 'Untitled Task',
    status: req.body.status || 'TODO',
    priority: req.body.priority || 'MEDIUM',
    dueDate: req.body.dueDate || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
  };
  mockTasks.unshift(newTask);
  res.status(201).json({ success: true, data: newTask });
});

router.put('/tasks/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = mockTasks.findIndex((t) => t.id === id);
  if (idx !== -1) {
    mockTasks[idx] = { ...mockTasks[idx], ...req.body };
    res.status(200).json({ success: true, data: mockTasks[idx] });
  } else {
    res.status(404).json({ success: false, message: 'Task not found' });
  }
});

router.delete('/tasks/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  mockTasks = mockTasks.filter((t) => t.id !== id);
  res.status(200).json({ success: true, message: 'Task deleted' });
});

// Goals routes
router.get('/goals', (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: mockGoals });
});

router.post('/goals', (req: Request, res: Response) => {
  const newGoal = {
    id: `goal-${Date.now()}`,
    title: req.body.title || 'Untitled Goal',
    category: req.body.category || 'General',
    progress: req.body.progress || 0,
    targetDate: req.body.targetDate || '2026-12-31',
  };
  mockGoals.unshift(newGoal);
  res.status(201).json({ success: true, data: newGoal });
});

router.put('/goals/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = mockGoals.findIndex((g) => g.id === id);
  if (idx !== -1) {
    mockGoals[idx] = { ...mockGoals[idx], ...req.body };
    res.status(200).json({ success: true, data: mockGoals[idx] });
  } else {
    res.status(404).json({ success: false, message: 'Goal not found' });
  }
});

router.delete('/goals/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  mockGoals = mockGoals.filter((g) => g.id !== id);
  res.status(200).json({ success: true, message: 'Goal deleted' });
});

export const taskGoalRoutes: Router = router;
