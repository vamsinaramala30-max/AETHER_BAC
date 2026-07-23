import { SystemSettingsDTO } from './settings.types';

export class SettingsService {
  private userSettings: Map<string, SystemSettingsDTO> = new Map();

  public async getSettings(userId: string): Promise<SystemSettingsDTO> {
    return (
      this.userSettings.get(userId) || {
        theme: 'system',
        notificationsEnabled: true,
        emailDigestFrequency: 'daily',
      }
    );
  }

  public async updateSettings(userId: string, settings: Partial<SystemSettingsDTO>): Promise<SystemSettingsDTO> {
    const current = await this.getSettings(userId);
    const updated = { ...current, ...settings };
    this.userSettings.set(userId, updated);
    return updated;
  }
}