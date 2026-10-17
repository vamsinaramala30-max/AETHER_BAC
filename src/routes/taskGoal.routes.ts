import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { ProjectsModuleSharedRepository } from '../modules/projects/project.repository';
import { ProjectsOrchestrationService } from '../modules/projects/project.service';
import { TasksController } from '../modules/projects/tasks/tasks.controller';
import { GoalsController } from '../modules/projects/goals/goals.controller';

const sharedRepo = new ProjectsModuleSharedRepository();
const orchestration = new ProjectsOrchestrationService(sharedRepo);
const tasksController = new TasksController(orchestration.tasks);
const goalsController = new GoalsController(orchestration.goals);

const router = Router();

// Scope authentication strictly to tasks and goals endpoints
router.use(['/tasks', '/goals'], authenticate);

function handle(
  handler: (req: Request) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req)
      .then((result) => res.status(200).json(result))
      .catch(next);
  };
}

function handleCreated(
  handler: (req: Request) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req)
      .then((result) => res.status(201).json(result))
      .catch(next);
  };
}

// Tasks routes
router.get(
  '/tasks',
  handle((req) =>
    tasksController.list({
      query: req.query as any,
      user: (req as any).user,
    }),
  ),
);

router.post(
  '/tasks',
  handleCreated((req) => {
    const userId = (req as any).user?.id;
    if (!req.body.projectId) {
      throw new AppError('A valid project ID is required to create a task', 400, 'INVALID_PROJECT_ID');
    }
    return tasksController.create({
      body: {
        ...req.body,
        assigneeIds: req.body.assigneeIds || (userId ? [userId] : []),
      },
      user: (req as any).user,
    });
  }),
);

router.post(
  '/tasks/bulk',
  handle((req) =>
    tasksController.bulk({
      body: req.body,
      user: (req as any).user,
    }),
  ),
);

router.get(
  '/tasks/:id',
  handle((req) =>
    tasksController.getOne({ params: { id: req.params.id }, user: (req as any).user }),
  ),
);

router.put(
  '/tasks/:id',
  handle((req) =>
    tasksController.update({
      params: { id: req.params.id },
      body: req.body,
      user: (req as any).user,
    }),
  ),
);

router.patch(
  '/tasks/:id',
  handle((req) =>
    tasksController.update({
      params: { id: req.params.id },
      body: req.body,
      user: (req as any).user,
    }),
  ),
);

router.delete(
  '/tasks/:id',
  handle((req) =>
    tasksController.delete({ params: { id: req.params.id }, user: (req as any).user }),
  ),
);

// Goals routes
router.get(
  '/goals',
  handle((req) =>
    goalsController.list({
      query: {
        ...req.query,
        userId: (req as any).user?.id,
      } as any,
    }),
  ),
);

router.post(
  '/goals',
  handleCreated((req) => {
    const userId = (req as any).user?.id;
    return goalsController.create({
      body: {
        ...req.body,
        userId,
        deadline: req.body.targetDate || req.body.deadline,
      },
    });
  }),
);

router.get(
  '/goals/:id',
  handle((req) =>
    goalsController.getOne({ params: { id: req.params.id }, user: (req as any).user }),
  ),
);

router.put(
  '/goals/:id',
  handle((req) =>
    goalsController.update({
      params: { id: req.params.id },
      body: req.body,
      user: (req as any).user,
    }),
  ),
);

router.patch(
  '/goals/:id/progress',
  handle((req) =>
    goalsController.update({
      params: { id: req.params.id },
      body: { currentValue: req.body.progress },
      user: (req as any).user,
    }),
  ),
);

router.delete(
  '/goals/:id',
  handle((req) =>
    goalsController.delete({ params: { id: req.params.id }, user: (req as any).user }),
  ),
);

export const taskGoalRoutes: Router = router;
