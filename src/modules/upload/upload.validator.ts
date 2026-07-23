import { z } from 'zod';

export const uploadFileSchema = z.object({
  body: z.object({
    bucket: z.string().optional(),
  }),
});