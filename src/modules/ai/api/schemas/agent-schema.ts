/**
 * AETHER AI — Agent API Schemas
 */

import type { ToolInputSchema } from '../../tools/tool-types.js';

export const runAgentSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    agentId: { type: 'string', description: 'Target agent ID' },
    goal: {
      type: 'string',
      description: 'Goal or prompt for agent execution',
      minLength: 1,
      maxLength: 8192,
    },
    conversationId: { type: 'string', description: 'Optional conversation scope' },
    maxIterations: {
      type: 'integer',
      description: 'Maximum allowed loop iterations',
      minimum: 1,
      maximum: 50,
    },
  },
  required: ['agentId', 'goal'],
};
