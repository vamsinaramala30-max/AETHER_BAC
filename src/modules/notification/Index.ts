import { Router } from 'express';
import { NotificationRepository } from './notification.repository';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { createNotificationRouter } from './notification.routes';
import { setupNotificationScheduler } from './notification.scheduler';

export function buildNotificationModule(authMiddleware: any): {
  router: Router;
  service: NotificationService;
} {
  const repo = new NotificationRepository();
  const emailService = new EmailService();
  const pushService = new PushService();
  const service = new NotificationService(repo, emailService, pushService);
  const controller = new NotificationController(service);

  setupNotificationScheduler(service);

  return {
    router: createNotificationRouter(controller, authMiddleware),
    service,
  };
}
