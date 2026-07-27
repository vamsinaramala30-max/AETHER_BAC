import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Workspace name must be at least 2 characters').trim(),
    slug: z
      .string()
      .min(2, 'Slug must be at least 2 characters')
      .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
      .trim(),
    description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
  }),
});

export const updateWorkspaceSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(2).trim().optional(),
    description: z.string().max(500).optional(),
  }),
});

export const addWorkspaceMemberSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    userId: z.string().uuid('Invalid user ID'),
    role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
  }),
});
