import { z } from 'zod';

export const createAutomationSchema = z.object({
  body: z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1),
    trigger: z.string().min(1),
    actions: z.record(z.unknown()),
  }),
});

export const updateAutomationSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    isEnabled: z.boolean().optional(),
    actions: z.record(z.unknown()).optional(),
  }),
});
