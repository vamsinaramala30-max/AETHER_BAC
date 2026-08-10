/**
 * AETHER AI — Memory API Schemas
 */

import type { ToolInputSchema } from '../../tools/tool-types.js';

export const createMemorySchema: ToolInputSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['conversation', 'fact', 'preference', 'summary', 'working'],
      description: 'Memory category type',
    },
    content: { type: 'string', description: 'Memory content text', minLength: 1, maxLength: 8192 },
    importance: { type: 'number', description: 'Importance score (0-1)', minimum: 0, maximum: 1 },
    ttlMs: { type: 'integer', description: 'Optional TTL in milliseconds', minimum: 1000 },
  },
  required: ['type', 'content'],
};
