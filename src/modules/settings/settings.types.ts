export interface SystemSettingsDTO {
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  emailDigestFrequency: 'daily' | 'weekly' | 'never';
}
