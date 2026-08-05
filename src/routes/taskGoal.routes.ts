import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { ProjectsModuleSharedRepository } from '../modules/projects/project.repository';
import { ProjectsOrchestrationService } from '../modules/projects/project.service';
import { TasksController } from '../modules/projects/tasks/tasks.controller';
import { GoalsController } from '../modules/projects/goals/goals.controller';

const sharedRepo = new ProjectsModuleSharedRepository();
const orchestration = new ProjectsOrchestrationService(sharedRepo);
const tasksController = new TasksController(orchestration.tasks);
const goalsController = new GoalsController(orchestration.goals);

const router = Router();

router.use(authenticate);

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
      query: {
        ...req.query,
        assigneeId: (req as any).user?.id,
      } as any,
    }),
  ),
);

router.post(
  '/tasks',
  handleCreated((req) => {
    const userId = (req as any).user?.id;
    return tasksController.create({
      body: {
        ...req.body,
        assigneeIds: req.body.assigneeIds || (userId ? [userId] : []),
      },
    });
  }),
);

router.get(
  '/tasks/:id',
  handle((req) => tasksController.getOne({ params: { id: req.params.id } })),
);

router.put(
  '/tasks/:id',
  handle((req) =>
    tasksController.update({ params: { id: req.params.id }, body: req.body }),
  ),
);

router.patch(
  '/tasks/:id',
  handle((req) =>
    tasksController.update({ params: { id: req.params.id }, body: req.body }),
  ),
);

router.delete(
  '/tasks/:id',
  handle((req) => tasksController.delete({ params: { id: req.params.id } })),
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
  handle((req) => goalsController.getOne({ params: { id: req.params.id } })),
);

router.put(
  '/goals/:id',
  handle((req) =>
    goalsController.update({ params: { id: req.params.id }, body: req.body }),
  ),
);

router.patch(
  '/goals/:id/progress',
  handle((req) =>
    goalsController.update({
      params: { id: req.params.id },
      body: { currentValue: req.body.progress },
    }),
  ),
);

router.delete(
  '/goals/:id',
  handle((req) => goalsController.delete({ params: { id: req.params.id } })),
);

export const taskGoalRoutes: Router = router;
