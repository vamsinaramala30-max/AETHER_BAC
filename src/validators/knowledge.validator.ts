import { z } from 'zod';

export const createKnowledgeBaseSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Knowledge base name is required').trim(),
    workspaceId: z.string().uuid('Workspace ID must be a valid UUID'),
  }),
});