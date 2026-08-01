import { z } from 'zod';

export const GetNotificationsQuerySchema = z.object({
  limit: z.coerce.number().optional().default(10),
});

export const MarkNotificationReadSchema = z.object({
  notificationId: z.string().uuid(),
});

export type GetNotificationsQueryDto = z.infer<typeof GetNotificationsQuerySchema>;
export type MarkNotificationReadDto = z.infer<typeof MarkNotificationReadSchema>;notifications.dto.ts