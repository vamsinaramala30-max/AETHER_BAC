import { z } from 'zod';

export const GetDailyOverviewQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

export type GetDailyOverviewQueryDto = z.infer<typeof GetDailyOverviewQuerySchema>;
