import { z } from 'zod';

export const notificationParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid notification ID'),
  }),
});