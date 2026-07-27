import { z } from 'zod';

export const createAutomationSchema = z.object({
  body: z.object({
    workspaceId: z.string().uuid('Workspace ID must be a valid UUID'),
    name: z.string().min(1, 'Automation name is required').trim(),
    trigger: z.string().min(1, 'Trigger event type is required'),
    actions: z.record(z.unknown()),
  }),
});

export const updateAutomationSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).trim().optional(),
    isEnabled: z.boolean().optional(),
    actions: z.record(z.unknown()).optional(),
  }),
});
