import { Router } from 'express';
import { WorkspaceModule } from '../modules/workspace/workspace.module';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  addWorkspaceMemberSchema,
} from '../validators/workspace.validator';

const _workspaceModule = new WorkspaceModule();
const workspaceController = _workspaceModule.workspaceController;
const focusController = _workspaceModule.focusController;

const router = Router();

router.use(authenticate);

// Focus session routes
router.post('/focus/start', (req, res, next) => focusController.handleStart(req, res, next));
router.post('/:workspaceId/focus/start', (req, res, next) =>
  focusController.handleStart(req, res, next),
);
router.post('/focus/:id/complete', (req, res, next) =>
  focusController.handleComplete(req, res, next),
);
router.post('/:workspaceId/focus/:id/complete', (req, res, next) =>
  focusController.handleComplete(req, res, next),
);
router.get('/focus/analytics', (req, res, next) => focusController.handleAnalytics(req, res, next));
router.get('/:workspaceId/focus/analytics', (req, res, next) =>
  focusController.handleAnalytics(req, res, next),
);

// Workspace routes
router.get('/', workspaceController.getUserWorkspaces);
router.post('/', validate(createWorkspaceSchema), workspaceController.createWorkspace);
router.get('/:id', workspaceController.getWorkspaceById);
router.put('/:id', validate(updateWorkspaceSchema), workspaceController.updateWorkspace);
router.delete('/:id', workspaceController.deleteWorkspace);
router.post('/:id/members', validate(addWorkspaceMemberSchema), workspaceController.addMember);

export const workspaceRoutes: Router = router;
