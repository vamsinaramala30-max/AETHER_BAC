import { z } from 'zod';

export const chatSchema = z.object({
  body: z
    .object({
      message: z.string().optional(),
      content: z.string().optional(),
      conversationId: z.string().optional(),
      workspaceId: z.string().optional(),
      model: z.string().optional(),
      temperature: z.number().optional(),
    })
    .refine((data) => !!(data.message || data.content), {
      message: 'Either message or content must be provided',
    }),
});

export const generatePromptSchema = z.object({
  body: z.object({
    prompt: z.string().min(1, 'Prompt string is required'),
  }),
});
