import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/admin.middleware';

const router = Router();

router.use(authenticate, requireAdmin);
router.get('/users', adminController.getSystemUsers);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/system-metrics', adminController.getSystemMetrics);

export const adminModuleRoutes: Router = router;
