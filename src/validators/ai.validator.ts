import { z } from 'zod';

export const chatSchema = z.object({
  body: z
    .object({
      message: z.string().optional(),
      content: z.string().optional(),
      messages: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
      conversationId: z.string().optional(),
      conversation_id: z.string().optional(),
      workspaceId: z.string().optional(),
      model: z.string().optional(),
      modelId: z.string().optional(),
      model_id: z.string().optional(),
      providerMode: z.enum(['auto', 'aether', 'gemini', 'openai', 'ollama']).optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      max_tokens: z.number().optional(),
      system_prompt: z.string().optional(),
      rag_context: z.string().optional(),
      stream: z.boolean().optional(),
    })
    .refine(
      (data) =>
        Boolean(data.message || data.content || (data.messages && data.messages.length > 0)),
      {
        message: 'Either message, content, or messages must be provided',
      },
    ),
});

export const generatePromptSchema = z.object({
  body: z.object({
    prompt: z.string().min(1, 'Prompt string is required'),
  }),
});
