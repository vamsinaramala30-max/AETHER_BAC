import { db } from '../../database/client';
import { SystemSettingsDTO } from './settings.types';

const defaultTheme: SystemSettingsDTO['theme'] = 'dark';

export class SettingsService {
  public async getSettings(userId: string): Promise<SystemSettingsDTO> {
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      const created = await db.userSettings.create({
        data: {
          userId,
          theme: defaultTheme,
          language: 'en',
          timezone: 'UTC',
          notificationPrefs: { email: true, push: true, desktop: true } as any,
          privacySettings: { profileVisibility: 'public' } as any,
        },
      });
      return {
        theme: created.theme as SystemSettingsDTO['theme'],
        language: created.language,
        timezone: created.timezone,
        notificationsEnabled: true,
        notificationPrefs: created.notificationPrefs as any,
        privacySettings: created.privacySettings as any,
        emailDigestFrequency: 'weekly',
      };
    }

    return {
      theme: settings.theme as SystemSettingsDTO['theme'],
      language: settings.language,
      timezone: settings.timezone,
      notificationsEnabled: true,
      notificationPrefs: settings.notificationPrefs as any,
      privacySettings: settings.privacySettings as any,
      emailDigestFrequency: 'weekly',
    };
  }

  public async updateSettings(
    userId: string,
    data: Partial<SystemSettingsDTO> & Record<string, any>,
  ): Promise<SystemSettingsDTO> {
    const current = await db.userSettings.findUnique({ where: { userId } });

    if (!current) {
      await db.userSettings.create({
        data: {
          userId,
          theme: (data.theme as SystemSettingsDTO['theme']) || defaultTheme,
          language: data.language || 'en',
          timezone: data.timezone || 'UTC',
          notificationPrefs: (data.notificationPrefs || { email: true, push: true, desktop: true }) as any,
          privacySettings: (data.privacySettings || { profileVisibility: 'public' }) as any,
        },
      });
    } else {
      await db.userSettings.update({
        where: { userId },
        data: {
          theme: (data.theme as SystemSettingsDTO['theme']) || current.theme,
          language: data.language || current.language,
          timezone: data.timezone || current.timezone,
          notificationPrefs: (data.notificationPrefs || current.notificationPrefs) as any,
          privacySettings: (data.privacySettings || current.privacySettings) as any,
        },
      });
    }

    return this.getSettings(userId);
  }
}
