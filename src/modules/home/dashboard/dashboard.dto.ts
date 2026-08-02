import { z } from 'zod';

export const GetDashboardQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

export type GetDashboardQueryDto = z.infer<typeof GetDashboardQuerySchema>;
