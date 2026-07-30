import { z } from 'zod';
import { DateRangeDtoSchema } from './DateRangeDto';

export const GetAnalyticsDtoSchema = DateRangeDtoSchema.extend({
  workspaceId: z.string().uuid().optional(),
  includeAI: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(true)),
});

export type GetAnalyticsDto = z.infer<typeof GetAnalyticsDtoSchema>;