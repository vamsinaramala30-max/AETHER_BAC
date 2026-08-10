/**
 * AETHER AI — Conversation Routes
 * GET /ai/conversations
 * POST /ai/conversations
 * GET /ai/conversations/:id
 * PATCH /ai/conversations/:id
 * DELETE /ai/conversations/:id
 */

import { conversationController } from '../controllers/conversation-controller.js';
import { authProvider } from '../middleware/auth.js';
import type { RouteContext } from './ai.js';

export async function handleConversationRoute(ctx: RouteContext) {
  const auth = await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'GET' && ctx.path === '/ai/conversations') {
    return conversationController.list(auth.userId);
  }

  if (ctx.method === 'POST' && ctx.path === '/ai/conversations') {
    const body = (ctx.body ?? {}) as { title?: string };
    return conversationController.create(body, auth.userId);
  }

  if (ctx.params?.['id']) {
    const id = ctx.params['id'];

    if (ctx.method === 'GET' && ctx.path === `/ai/conversations/${id}`) {
      return conversationController.get(id, auth.userId);
    }

    if (ctx.method === 'PATCH' && ctx.path === `/ai/conversations/${id}`) {
      const body = (ctx.body ?? {}) as { title: string };
      return conversationController.rename(id, body, auth.userId);
    }

    if (ctx.method === 'DELETE' && ctx.path === `/ai/conversations/${id}`) {
      return conversationController.delete(id, auth.userId);
    }
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
