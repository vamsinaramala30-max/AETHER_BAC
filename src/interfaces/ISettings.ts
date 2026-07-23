export interface ISettings {
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  emailDigestFrequency: 'daily' | 'weekly' | 'never';
}