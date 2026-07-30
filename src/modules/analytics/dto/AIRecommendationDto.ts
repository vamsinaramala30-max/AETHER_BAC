import { z } from 'zod';
import { PriorityLevel } from '../analytics.types';

export const AIRecommendationDtoSchema = z.object({
  minImpactScore: z.preprocess((val) => parseInt(String(val), 10) || 0, z.number().min(0).max(100).default(0)),
  priority: z.nativeEnum(PriorityLevel).optional(),
});

export type AIRecommendationDto = z.infer<typeof AIRecommendationDtoSchema>;