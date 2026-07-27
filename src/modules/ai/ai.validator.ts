import { z } from 'zod';

export const chatSchema = z.object({
  body: z.object({
    message: z.string().min(1, 'Message cannot be empty'),
    conversationId: z.string().uuid().optional(),
    workspaceId: z.string().uuid('Workspace ID must be a valid UUID'),
  }),
});

export const generatePromptSchema = z.object({
  body: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
  }),
});
