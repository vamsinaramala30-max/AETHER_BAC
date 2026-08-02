import { Router } from 'express';
import { ProjectsOrchestrationController } from '../modules/projects/project.controller';
import { ProjectsModuleSharedRepository } from '../modules/projects/project.repository';
import { ProjectsOrchestrationService } from '../modules/projects/project.service';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createProjectSchema, updateProjectSchema } from '../validators/project.validator';

const _sharedRepo = new ProjectsModuleSharedRepository();
const _service = new ProjectsOrchestrationService(_sharedRepo);
const projectController = new ProjectsOrchestrationController(_service);

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => projectController.getDashboard(req as any, res as any, next));
router.post('/', validate(createProjectSchema), (req, res, next) =>
  projectController.getDashboard(req as any, res as any, next),
);
router.get('/:id', (req, res, next) => projectController.getOverview(req as any, res as any, next));
router.put('/:id', validate(updateProjectSchema), (req, res, next) =>
  projectController.getOverview(req as any, res as any, next),
);
router.delete('/:id', (req, res, next) =>
  projectController.getDashboard(req as any, res as any, next),
);

export const projectRoutes: Router = router;
