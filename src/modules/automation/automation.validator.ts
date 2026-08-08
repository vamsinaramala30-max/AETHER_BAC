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
    description: z.string().nullable().optional(),
    isEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    trigger: z.string().optional(),
    triggerType: z.string().optional(),
    conditions: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    actions: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    nodes: z.array(z.unknown()).optional(),
  }),
});
