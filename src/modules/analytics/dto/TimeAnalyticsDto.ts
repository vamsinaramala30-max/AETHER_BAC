import { z } from 'zod';
import { DateRangeDtoSchema } from './DateRangeDto';

export const TimeAnalyticsDtoSchema = DateRangeDtoSchema.extend({
  groupBy: z.enum(['category', 'project', 'day']).default('category'),
});

export type TimeAnalyticsDto = z.infer<typeof TimeAnalyticsDtoSchema>;