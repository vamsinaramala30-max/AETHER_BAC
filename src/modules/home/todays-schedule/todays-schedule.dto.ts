import { z } from 'zod';

export const GetTodaysScheduleQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

export type GetTodaysScheduleQueryDto = z.infer<typeof GetTodaysScheduleQuerySchema>;