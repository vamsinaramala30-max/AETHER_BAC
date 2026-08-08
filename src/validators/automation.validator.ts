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
    description: z.string().nullable().optional(),
    isEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    trigger: z.string().optional(),
    triggerType: z.string().optional(),
    conditions: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    actions: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    nodes: z.array(z.unknown()).optional(),
    schedule: z.string().nullable().optional(),
    status: z.string().optional(),
  }),
});
