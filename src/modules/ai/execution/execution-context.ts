/**
 * AETHER AI - Execution Context Builder (Prompt 8)
 * Builds ExecutionContext exclusively from authenticated server-side data.
 * The model/client CANNOT override userId, workspaceId, or any permission field.
 * This is the only authoritative source of execution identity.
 */

import type { Request } from 'express';
import type { ExecutionContext } from './execution-types.js';
import type { AuthenticationContext } from '../tools/tool-types.js';
import { randomUUID } from 'crypto';

export class ExecutionContextBuilder {
  /**
   * Build an ExecutionContext from an authenticated Express request.
   * userId comes from req.user (set by JWT/session middleware), NEVER from req.body.
   */
  public fromRequest(
    req: Request,
    overrides?: {
      conversationId?: string;
      projectId?: string;
      signal?: AbortSignal;
    },
  ): ExecutionContext {
    const user = req.user as any;
    const userId: string = user?.id ?? user?.userId ?? 'anonymous';
    const sessionId: string = user?.sessionId ?? (req as any).sessionID ?? 'sess_' + userId;
    const roles: readonly string[] = user?.roles ?? ['user'];
    const permissions: readonly string[] = user?.permissions ?? ['*'];
    const workspaceId: string | undefined = user?.workspaceId ?? req.headers['x-workspace-id'] as string | undefined;

    const correlationId: string =
      (req.headers['x-correlation-id'] as string) ??
      (req.headers['x-request-id'] as string) ??
      'corr_' + Date.now();

    const requestId: string =
      (req.headers['x-request-id'] as string) ?? 'req_' + randomUUID();

    const auth: AuthenticationContext = {
      userId,
      sessionId,
      roles,
      permissions,
      workspaceId,
    };

    return {
      userId,
      sessionId,
      roles,
      permissions,
      workspaceId,
      projectId: overrides?.projectId,
      conversationId: overrides?.conversationId,
      correlationId,
      requestId,
      auth,
      signal: overrides?.signal,
    };
  }

  /**
   * Build ExecutionContext directly from an AuthenticationContext (for internal use).
   * Used when calling the execution engine from within the orchestrator.
   */
  public fromAuthContext(
    auth: AuthenticationContext,
    options?: {
      workspaceId?: string;
      projectId?: string;
      conversationId?: string;
      correlationId?: string;
      requestId?: string;
      signal?: AbortSignal;
    },
  ): ExecutionContext {
    return {
      userId: auth.userId,
      sessionId: auth.sessionId,
      roles: auth.roles,
      permissions: auth.permissions,
      workspaceId: options?.workspaceId ?? auth.workspaceId,
      projectId: options?.projectId,
      conversationId: options?.conversationId,
      correlationId: options?.correlationId ?? 'corr_' + Date.now(),
      requestId: options?.requestId ?? 'req_' + randomUUID(),
      auth,
      signal: options?.signal,
    };
  }
}

export const executionContextBuilder = new ExecutionContextBuilder();
