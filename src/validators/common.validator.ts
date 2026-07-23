import { z } from 'zod';

export const uuidParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid UUID format provided for identifier.'),
  }),
});

export const paginationQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)).default('1'),
    limit: z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10)).default('20'),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});