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

router.get('/', (req, res, next) => projectController.getDashboard(req, res, next));
router.post('/', validate(createProjectSchema), (req, res, next) =>
  projectController.create(req, res, next),
);
router.get('/:id', (req, res, next) => projectController.getById(req, res, next));
router.put('/:id', validate(updateProjectSchema), (req, res, next) =>
  projectController.update(req, res, next),
);
router.patch('/:id', validate(updateProjectSchema), (req, res, next) =>
  projectController.update(req, res, next),
);
router.delete('/:id', (req, res, next) => projectController.delete(req, res, next));

export const projectRoutes: Router = router;
