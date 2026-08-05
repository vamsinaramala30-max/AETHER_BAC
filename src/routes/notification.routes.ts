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

router.get('/preferences', (req, res, next) => notificationController.getPreferences(req, res, next));
router.put('/preferences', (req, res, next) => notificationController.updatePreferences(req, res, next));
router.post('/subscribe', (req, res, next) => notificationController.subscribePush(req, res, next));
router.get('/', (req, res, next) => notificationController.getHistory(req, res, next));
router.patch('/:id/read', (req, res, next) => notificationController.markRead(req, res, next));
router.patch('/read-all', (req, res, next) => notificationController.markAllRead(req, res, next));
router.delete('/clear-all', (req, res, next) => notificationController.deleteAll(req, res, next));
router.delete('/:id', (req, res, next) => notificationController.delete(req, res, next));

export const notificationRoutes: Router = router;
