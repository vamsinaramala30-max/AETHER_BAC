import cron from 'node-cron';
import { NotificationService } from './notification.service';

export function setupNotificationScheduler(service: NotificationService) {
  // Weekly Digest Cron - Runs every Sunday at midnight
  cron.schedule('0 0 * * 0', async () => {
    console.log('[CRON] Executing weekly performance digest dispatch...');
    // Fetch target users and dispatch weekly digest using service.dispatchNotification
  });
}