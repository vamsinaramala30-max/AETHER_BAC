import { Router } from 'express';
import { moduleAutomationRoutes } from '../modules/automation/automation.routes';

const router = Router();

// Delegate all automation requests directly to module routes under src/modules/automation/
router.use('/', moduleAutomationRoutes);

export const automationRoutes: Router = router;
