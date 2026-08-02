import { z } from 'zod';
import { AnalyticsPreset } from '../analytics.types';

export const DateRangeDtoSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  preset: z.nativeEnum(AnalyticsPreset).default(AnalyticsPreset.SEVEN_DAYS),
});

export type DateRangeDto = z.infer<typeof DateRangeDtoSchema>;
