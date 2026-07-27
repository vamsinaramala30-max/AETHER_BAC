import { Router } from 'express';
import { adminController } from '../modules/admin/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

// Enforce both Authentication and Admin role checks
router.use(authenticate, requireAdmin);

router.get('/users', adminController.getSystemUsers);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/system-metrics', adminController.getSystemMetrics);

export const adminRoutes: Router = router;
