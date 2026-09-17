/**
 * AETHER AI — Knowledge Routes
 * GET /ai/knowledge
 * POST /ai/knowledge
 * DELETE /ai/knowledge/:id
 */

import { knowledgeController } from '../controllers/knowledge-controller.js';
import { authProvider } from '../middleware/auth.js';
import type { RouteContext } from './ai.js';

export async function handleKnowledgeRoute(ctx: RouteContext) {
  await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'GET' && ctx.path === '/ai/knowledge') {
    return knowledgeController.listCollections();
  }

  if (ctx.method === 'POST' && ctx.path === '/ai/knowledge') {
    const body = (ctx.body ?? {}) as {
      title: string;
      content: string;
      mimeType?: string;
      collectionId?: string;
    };
    return knowledgeController.ingestDocument(body);
  }

  if (
    ctx.params?.['id'] &&
    ctx.method === 'DELETE' &&
    ctx.path === `/ai/knowledge/${ctx.params['id']}`
  ) {
    return knowledgeController.deleteDocument(ctx.params['id']);
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
