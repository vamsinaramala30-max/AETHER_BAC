export enum NotificationEventType {
  NOTIFICATION_SENT = 'notification.sent',
  NOTIFICATION_READ = 'notification.read',
}

export interface NotificationSentPayload {
  notificationId: string;
  userId: string;
  title: string;
  type: string;
  sentAt: Date;
}