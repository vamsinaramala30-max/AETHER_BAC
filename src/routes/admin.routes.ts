import { Router } from 'express';
import { adminController } from '../modules/admin/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { strictRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// ----------------------------------------------------------------------------
// Dedicated Administrator Authentication Endpoints (Rate Limited & Throttled)
// ----------------------------------------------------------------------------
router.post('/login', strictRateLimiter, adminController.login);
router.post('/mfa/verify', strictRateLimiter, adminController.verifyMfa);

// ----------------------------------------------------------------------------
// Protected Administrative Endpoints (Authentication + Admin Role Enforced)
// ----------------------------------------------------------------------------
router.use(authenticate, requireAdmin);

router.post('/logout', adminController.logout);
router.get('/overview', adminController.getOverview);

// User Management
router.get('/users', adminController.getSystemUsers);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/users/:id/status', adminController.updateUserStatus);
router.post('/users/:id/revoke-sessions', adminController.revokeUserSessions);
router.post('/users/:id/export', adminController.exportUserData);

// Security & Audit
router.get('/audit-logs', adminController.getAuditLogs);

// Database & Operational Recovery
router.get('/database/status', adminController.getDatabaseStatus);
router.post('/database/backup', adminController.triggerBackup);
router.get('/system-metrics', adminController.getSystemMetrics);

export const adminRoutes: Router = router;
