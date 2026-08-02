import { z } from 'zod';

export const GetRecentActivityQuerySchema = z.object({
  limit: z.coerce.number().optional().default(10),
});

export type GetRecentActivityQueryDto = z.infer<typeof GetRecentActivityQuerySchema>;
