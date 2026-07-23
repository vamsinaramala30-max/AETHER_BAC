import { z } from 'zod';

export const updateSettingsSchema = z.object({
  body: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    notificationsEnabled: z.boolean().optional(),
    emailDigestFrequency: z.enum(['daily', 'weekly', 'never']).optional(),
  }),
});