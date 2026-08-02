import { z } from 'zod';

export const ExecuteQuickActionSchema = z.object({
  actionKey: z.string().min(1),
  workspaceId: z.string().uuid(),
  payload: z.record(z.any()).optional(),
});

export type ExecuteQuickActionDto = z.infer<typeof ExecuteQuickActionSchema>;
