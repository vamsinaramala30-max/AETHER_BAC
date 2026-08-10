/**
 * AETHER AI — Chat API Request/Response Schemas
 */

import type { JSONSchemaProperty, ToolInputSchema } from '../../tools/tool-types.js';

export const chatRequestSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'User chat prompt', minLength: 1, maxLength: 32768 },
    conversationId: { type: 'string', description: 'Optional conversation ID' },
    modelId: { type: 'string', description: 'Optional model override' },
    enableMemory: { type: 'boolean', description: 'Enable long-term memory retrieval' },
    enableRAG: { type: 'boolean', description: 'Enable RAG document retrieval' },
    ragCollectionIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Restrict RAG search to collection IDs',
    },
  },
  required: ['message'],
};
