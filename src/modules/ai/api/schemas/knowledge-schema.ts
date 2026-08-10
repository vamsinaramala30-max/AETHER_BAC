/**
 * AETHER AI — Knowledge API Schemas
 */

import type { ToolInputSchema } from '../../tools/tool-types.js';

export const createCollectionSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Collection name', minLength: 1, maxLength: 200 },
    description: { type: 'string', description: 'Collection description', maxLength: 1000 },
  },
  required: ['name'],
};

export const ingestDocumentSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Document title', minLength: 1, maxLength: 500 },
    content: { type: 'string', description: 'Document raw content', minLength: 1 },
    mimeType: { type: 'string', description: 'MIME type of document' },
    collectionId: { type: 'string', description: 'Target collection ID' },
  },
  required: ['title', 'content'],
};
