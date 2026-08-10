/**
 * AETHER AI — Model Management Routes
 * GET /ai/models
 * GET /ai/models/status
 */

import { modelController } from '../controllers/model-controller.js';
import { authProvider } from '../middleware/auth.js';
import type { RouteContext } from './ai.js';

export async function handleModelRoute(ctx: RouteContext) {
  await authProvider.authenticate(ctx.headers);

  if (ctx.method === 'GET' && ctx.path === '/ai/models') {
    return modelController.listModels();
  }

  if (ctx.method === 'GET' && ctx.path === '/ai/models/status') {
    return modelController.getRuntimeStatus();
  }

  return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } };
}
