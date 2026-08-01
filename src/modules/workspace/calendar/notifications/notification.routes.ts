import { Router } from 'express';
import { NotificationController } from './notification.controller';

export function createNotificationRouter(controller: NotificationController): Router {
  const router = Router();
  router.get('/', (req, res, next) => controller.getUserNotifications(req, res, next));
  return router;
}