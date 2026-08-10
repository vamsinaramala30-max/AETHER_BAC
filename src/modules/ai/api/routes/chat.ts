/**
 * AETHER AI — Chat Routes
 * POST /ai/chat
 * POST /ai/chat/stream
 */

import { chatController } from '../controllers/chat-controller.js';
import { authProvider } from '../middleware/auth.js';
import type { StreamSubscriber } from '../../core/streaming-engine.js';
import type { RouteContext } from './ai.js';

export async function handleChatRoute(ctx: RouteContext, streamSubscriber?: StreamSubscriber) {
  const auth = await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'POST' && ctx.path === '/ai/chat') {
    const body = (ctx.body ?? {}) as { message: string; conversationId?: string; modelId?: string };
    return chatController.chat(body, auth.userId);
  }

  if (ctx.method === 'POST' && ctx.path === '/ai/chat/stream') {
    if (!streamSubscriber) {
      return { success: false, error: { code: 'INVALID_REQUEST', message: 'Stream subscriber required for streaming.' } };
    }
    const body = (ctx.body ?? {}) as { message: string; conversationId?: string; modelId?: string };
    return chatController.chatStream(body, auth.userId, streamSubscriber);
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
