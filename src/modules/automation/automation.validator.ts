import { z } from 'zod';

export const createAutomationSchema = z.object({
  body: z.object({
    workspaceId: z.string().optional(),
    name: z.string().min(1, 'Automation name is required').trim(),
    description: z.string().nullable().optional(),
    trigger: z.string().min(1, 'Trigger is required'),
    triggerConfig: z.record(z.unknown()).optional(),
    conditions: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    actions: z.union([z.record(z.unknown()), z.array(z.unknown())]),
    nodes: z.array(z.unknown()).optional(),
    schedule: z.string().nullable().optional(),
    isEnabled: z.boolean().optional(),
  }),
});

export const updateAutomationSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(1).trim().optional(),
    description: z.string().nullable().optional(),
    trigger: z.string().optional(),
    triggerType: z.string().optional(),
    triggerConfig: z.record(z.unknown()).optional(),
    conditions: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    actions: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable().optional(),
    nodes: z.array(z.unknown()).optional(),
    schedule: z.string().nullable().optional(),
    isEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    status: z.enum([
      'DRAFT',
      'ACTIVE',
      'PAUSED',
      'RUNNING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'NEEDS_APPROVAL',
    ]).optional(),
  }),
});

export const runAutomationSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    triggerData: z.record(z.unknown()).optional(),
  }).optional(),
});

export const approveExecutionSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    executionId: z.string().min(1),
  }),
  body: z.object({
    note: z.string().optional(),
  }).optional(),
});

export const rejectExecutionSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    executionId: z.string().min(1),
  }),
  body: z.object({
    reason: z.string().optional(),
  }).optional(),
});
