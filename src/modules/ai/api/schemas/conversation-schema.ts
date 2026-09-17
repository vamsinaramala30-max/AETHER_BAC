/**
 * AETHER AI — Conversation API Schemas
 */

import type { ToolInputSchema } from '../../tools/tool-types.js';

export const createConversationSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Conversation title', maxLength: 200 },
  },
};

export const updateConversationSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Updated conversation title',
      minLength: 1,
      maxLength: 200,
    },
  },
  required: ['title'],
};
