import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    slug: z.string().min(2, 'Slug must be at least 2 characters'),
    description: z.string().optional(),
  }),
});

export const updateWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
  }),
});

export const addWorkspaceMemberSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
  }),
});
