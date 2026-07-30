import { z } from 'zod';
import { DateRangeDtoSchema } from './DateRangeDto';
import { ExportFormat } from '../analytics.types';

export const ExportAnalyticsDtoSchema = DateRangeDtoSchema.extend({
  format: z.nativeEnum(ExportFormat).default(ExportFormat.JSON),
  includeProductivity: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(true)),
  includeGoals: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(true)),
  includeTime: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(true)),
  includeAI: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(true)),
});

export type ExportAnalyticsDto = z.infer<typeof ExportAnalyticsDtoSchema>;