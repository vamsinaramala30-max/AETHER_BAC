import { Router } from 'express';
import { settingsController } from '../modules/settings/settings.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Profile
router.get('/', settingsController.getProfile);
router.get('/profile', settingsController.getProfile);
router.patch('/profile', settingsController.updateProfile);
router.put('/profile', settingsController.updateProfile);
router.post('/profile/avatar', settingsController.updateAvatar);
router.delete('/profile/avatar', settingsController.removeAvatar);

// Notifications
router.get('/notifications', settingsController.getNotificationPreferences);
router.patch('/notifications', settingsController.updateNotificationPreferences);
router.put('/notifications', settingsController.updateNotificationPreferences);

// Password & Security
router.patch('/password', settingsController.changePassword);
router.post('/password', settingsController.changePassword);

// Sessions
router.get('/sessions', settingsController.getActiveSessions);
router.delete('/sessions/:id', settingsController.revokeSession);
router.post('/sessions/revoke-all', settingsController.revokeAllOtherSessions);

// Connected OAuth Accounts
router.get('/connections', settingsController.getConnectedAccounts);
router.delete('/connections/:provider', settingsController.disconnectAccount);

// Account Deletion
router.delete('/account', settingsController.deleteAccount);

export const settingsRoutes: Router = router;
