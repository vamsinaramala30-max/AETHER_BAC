import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/admin.middleware';
import { strictRateLimiter } from '../../middleware/rateLimit.middleware';

const router = Router();

// Public Rate-Limited Auth
router.post('/login', strictRateLimiter, adminController.login);
router.post('/mfa/verify', strictRateLimiter, adminController.verifyMfa);

// Protected Admin Zone
router.use(authenticate, requireAdmin);

router.post('/logout', adminController.logout);
router.get('/overview', adminController.getOverview);
router.get('/users', adminController.getSystemUsers);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/users/:id/status', adminController.updateUserStatus);
router.post('/users/:id/revoke-sessions', adminController.revokeUserSessions);
router.post('/users/:id/export', adminController.exportUserData);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/database/status', adminController.getDatabaseStatus);
router.post('/database/backup', adminController.triggerBackup);
router.get('/system-metrics', adminController.getSystemMetrics);

export const adminModuleRoutes: Router = router;
