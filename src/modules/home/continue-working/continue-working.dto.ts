import { z } from 'zod';

export const GetContinueWorkingQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.coerce.number().optional().default(5),
});

export type GetContinueWorkingQueryDto = z.infer<typeof GetContinueWorkingQuerySchema>;
