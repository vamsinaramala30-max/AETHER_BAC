export interface NotificationPreferencesData {
  emailAlerts: boolean;
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
  channels: ('IN_APP' | 'EMAIL' | 'PUSH')[];
}

export interface PushSubscriptionDTO {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
