export interface SystemSettingsDTO {
  theme: 'light' | 'dark' | 'system';
  language?: string;
  timezone?: string;
  notificationsEnabled: boolean;
  notificationPrefs?: Record<string, unknown>;
  privacySettings?: Record<string, unknown>;
  emailDigestFrequency: 'daily' | 'weekly' | 'never';
}
