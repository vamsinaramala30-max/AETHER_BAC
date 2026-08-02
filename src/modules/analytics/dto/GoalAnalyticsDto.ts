import { z } from 'zod';

export const GoalAnalyticsDtoSchema = z.object({
  status: z.enum(['active', 'completed', 'all']).default('all'),
  limit: z.preprocess((val) => parseInt(String(val), 10) || 10, z.number().positive().default(10)),
});

export type GoalAnalyticsDto = z.infer<typeof GoalAnalyticsDtoSchema>;
