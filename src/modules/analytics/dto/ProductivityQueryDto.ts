import { z } from 'zod';
import { DateRangeDtoSchema } from './DateRangeDto';

export const ProductivityQueryDtoSchema = DateRangeDtoSchema.extend({
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

export type ProductivityQueryDto = z.infer<typeof ProductivityQueryDtoSchema>;