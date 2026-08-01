import { z } from 'zod';

export const UpdateWidgetConfigSchema = z.object({
  widgets: z.array(
    z.object({
      id: z.string(),
      widgetKey: z.string(),
      title: z.string(),
      enabled: z.boolean(),
      order: z.number(),
    })
  ),
});

export type UpdateWidgetConfigDto = z.infer<typeof UpdateWidgetConfigSchema>;