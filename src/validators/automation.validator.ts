import { z } from 'zod';

export const createAutomationSchema = z.object({
  body: z.object({
    workspaceId: z.string().optional(),
    name: z.string().min(1, 'Automation name is required').trim(),
    trigger: z.string().optional(),
    actions: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
  }),
});

export const updateAutomationSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(1).trim().optional(),
    isEnabled: z.boolean().optional(),
    actions: z.union([z.record(z.unknown()), z.array(z.unknown())]).optional(),
    trigger: z.string().optional(),
  }),
});
