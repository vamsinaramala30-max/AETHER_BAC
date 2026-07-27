import { Router } from 'express';
import { NotificationController } from './notification.controller';
import { validatePreferences } from './notification.validation';

export function createNotificationRouter(
  controller: NotificationController,
  authMiddleware: any,
): Router {
  const router = Router();

  router.use(authMiddleware);

  // Exact endpoints targeted by frontend notificationService.ts
  router.get('/user/settings/notifications', controller.getPreferences);
  router.put('/user/settings/notifications', validatePreferences, controller.updatePreferences);

  // Additional In-App notification management
  router.get('/notifications', controller.getHistory);
  router.patch('/notifications/read-all', controller.markAllRead);
  router.patch('/notifications/:id/read', controller.markRead);
  router.delete('/notifications/:id', controller.delete);
  router.post('/notifications/push/subscribe', controller.subscribePush);

  return router;
}
