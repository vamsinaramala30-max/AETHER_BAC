import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Workspace name must be at least 2 characters').trim(),
    slug: z
      .string()
      .min(2, 'Slug must be at least 2 characters')
      .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
      .trim()
      .optional(),
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
    logoUrl: z.string().url().optional(),
  }),
});

export const addWorkspaceMemberSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      userId: z.string().uuid('Invalid user ID').optional(),
      email: z.string().email('Invalid email address').optional(),
      role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).optional(),
    })
    .refine((data) => data.userId || data.email, {
      message: 'Either userId or email must be provided',
    }),
});

export const updateWorkspaceMemberSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    memberId: z.string().uuid(),
  }),
  body: z.object({
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
  }),
});

