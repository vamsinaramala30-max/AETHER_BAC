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

const router = Router();

router.use(authenticate);

router.get('/', workspaceController.getUserWorkspaces);
router.post('/', validate(createWorkspaceSchema), workspaceController.createWorkspace);
router.get('/:id', workspaceController.getWorkspaceById);
router.put('/:id', validate(updateWorkspaceSchema), workspaceController.updateWorkspace);
router.delete('/:id', workspaceController.deleteWorkspace);
router.post('/:id/members', validate(addWorkspaceMemberSchema), workspaceController.addMember);

export const workspaceRoutes: Router = router;
