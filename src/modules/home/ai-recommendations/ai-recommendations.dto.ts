import { z } from 'zod';

export const GetAIRecommendationsQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

export type GetAIRecommendationsQueryDto = z.infer<typeof GetAIRecommendationsQuerySchema>;
