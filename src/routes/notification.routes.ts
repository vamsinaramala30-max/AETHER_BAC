import { Router } from 'express';
import { NotificationController } from '../modules/notification/notification.controller';
import { NotificationService } from '../modules/notification/notification.service';
import { NotificationRepository } from '../modules/notification/notification.repository';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

const notificationController = new NotificationController(
  new NotificationService(new NotificationRepository()),
);

router.use(authenticate);

router.get('/', (req, res, next) => notificationController.getHistory(req, res, next));
router.patch('/:id/read', (req, res, next) => notificationController.markRead(req, res, next));
router.patch('/read-all', (req, res, next) => notificationController.markAllRead(req, res, next));

export const notificationRoutes: Router = router;
