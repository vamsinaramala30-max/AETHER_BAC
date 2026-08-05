export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH' | 'BROWSER';

export interface NotificationPreferencesData {
  emailAlerts: boolean;
  pushNotifications: boolean;
  browserNotifications: boolean;
  workspaceNotifications: boolean;
  projectNotifications: boolean;
  mentionNotifications: boolean;
  automationNotifications: boolean;
  securityAlerts: boolean;
  systemUpdates: boolean;
  weeklyDigest: boolean;
}

export interface SendNotificationDTO {
  userId: string;
  email?: string;
  title: string;
  message: string;
  category: keyof NotificationPreferencesData;
  channels: NotificationChannel[];
  type?: 'SYSTEM' | 'PROJECT' | 'TASK' | 'CALENDAR' | 'AI' | 'AUTOMATION' | 'SECURITY' | 'KNOWLEDGE' | 'WORKSPACE';
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface PushSubscriptionDTO {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
