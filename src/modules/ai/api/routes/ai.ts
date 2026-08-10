/**
 * AETHER AI — Core AI Routes
 * Defines route definitions for POST /ai/process.
 */

import { aiController } from '../controllers/ai-controller.js';
import { authProvider } from '../middleware/auth.js';
import { extractOrCreateRequestId } from '../middleware/request-id.js';

export interface RouteContext {
  readonly path: string;
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly headers: Record<string, string | undefined>;
  readonly params?: Record<string, string>;
  readonly body?: unknown;
}

export async function handleAIRoute(ctx: RouteContext) {
  const reqCtx = extractOrCreateRequestId(ctx.headers['x-request-id']);
  const auth = await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'POST' && ctx.path === '/ai/process') {
    return aiController.processRequest(ctx.body, auth.userId, auth.sessionId);
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
