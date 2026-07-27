import { z } from 'zod';

export const createKnowledgeBaseSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Knowledge base name is required'),
    workspaceId: z.string().uuid(),
  }),
});
