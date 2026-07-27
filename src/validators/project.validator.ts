import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Project name is required').trim(),
    description: z.string().optional(),
    workspaceId: z.string().uuid('Workspace ID must be a valid UUID'),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).trim().optional(),
    description: z.string().optional(),
  }),
});
