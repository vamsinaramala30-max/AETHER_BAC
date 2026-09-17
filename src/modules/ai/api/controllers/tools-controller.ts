/**
 * AETHER AI — Tools Controller
 * Authoritative REST API controller for tool discovery, execution, verification, and audit trail.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { toolRegistry } from '../../tools/tool-registry.js';
import { toolExecutor } from '../../tools/tool-executor.js';
import { actionAuditLogger } from '../../audit/action-audit-logger.js';
import type { ToolExecutionContext, AuthenticationContext } from '../../tools/tool-types.js';

export class ToolsController {
  public async listTools(filter?: { category?: string; riskLevel?: string }) {
    if (filter?.category) {
      return { success: true, data: toolRegistry.listByCategory(filter.category) };
    }
    if (filter?.riskLevel) {
      return { success: true, data: toolRegistry.listByRiskLevel(filter.riskLevel) };
    }
    return { success: true, data: toolRegistry.list() };
  }

  public async getTool(name: string) {
    const tool = toolRegistry.get(name);
    if (!tool) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Tool "${name}" not found.` } };
    }
    return {
      success: true,
      data: {
        id: tool.id ?? `tool_${tool.name}`,
        name: tool.name,
        description: tool.description,
        version: tool.version ?? '1.0.0',
        category: tool.category,
        inputSchema: tool.inputSchema,
        requiredPermissions: tool.requiredPermissions ?? tool.permissions ?? [],
        riskLevel: tool.riskLevel ?? 'READ_ONLY',
        requiresConfirmation: tool.requiresConfirmation ?? false,
        idempotent: tool.idempotent ?? false,
        retryable: tool.retryable ?? false,
        timeoutMs: tool.timeoutMs ?? 30000,
      },
    };
  }

  public async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    auth: AuthenticationContext,
    options?: { idempotencyKey?: string; timeoutMs?: number; correlationId?: string },
  ) {
    const context: ToolExecutionContext = {
      auth,
      traceId: crypto.randomUUID(),
      correlationId: options?.correlationId,
      workspaceId: auth.workspaceId,
    };

    const result = await toolExecutor.execute(toolName, input, context, {
      idempotencyKey: options?.idempotencyKey,
      timeoutMs: options?.timeoutMs,
    });

    return result;
  }

  public async getExecutions(filter?: { userId?: string; toolName?: string; limit?: number }) {
    const logs = await actionAuditLogger.getLogs(filter);
    return { success: true, data: logs };
  }

  public async getExecutionById(id: string) {
    const log = await actionAuditLogger.getLogById(id);
    if (!log) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Execution "${id}" not found.` } };
    }
    return { success: true, data: log };
  }
}

export const toolsController = new ToolsController();

export class ToolsExpressController {
  public async listTools(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const riskLevel = typeof req.query.riskLevel === 'string' ? req.query.riskLevel : undefined;
      const result = await toolsController.listTools({ category, riskLevel });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getTool(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.params;
      if (!name) {
        res.status(400).json({ success: false, error: { message: 'Tool name is required.' } });
        return;
      }
      const result = await toolsController.getTool(name);
      if (!result.success) {
        res.status(404).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async executeTool(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body || {};
      const toolName = body.toolName || body.tool || body.name;
      const input = body.input || body.args || body.parameters || {};
      const idempotencyKey = req.headers['idempotency-key'] as string || body.idempotencyKey;
      const timeoutMs = body.timeoutMs ? Number(body.timeoutMs) : undefined;
      const correlationId = (req.headers['x-correlation-id'] as string) || body.correlationId;

      if (!toolName) {
        res.status(400).json({
          success: false,
          code: 'INVALID_INPUT',
          error: 'Tool name is required in request body (toolName, tool, or name).',
        });
        return;
      }

      const user = req.user as any;
      const userId = user?.id || (req as any).userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          code: 'PERMISSION_DENIED',
          error: 'Authentication required: userId not found on request context.',
        });
        return;
      }

      const roles = Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : ['user'];
      const permissions = Array.isArray(user?.permissions) ? user.permissions : ['*'];
      const workspaceId = user?.workspaceId || (req as any).workspaceId;

      const auth: AuthenticationContext = {
        userId,
        sessionId: (req as any).sessionID || `sess_${userId}`,
        roles,
        permissions,
        workspaceId,
      };

      const result = await toolsController.executeTool(toolName, input, auth, {
        idempotencyKey,
        timeoutMs,
        correlationId,
      });

      const httpStatus = result.success
        ? 200
        : result.code === 'TOOL_NOT_FOUND' || result.code === 'NOT_FOUND'
          ? 404
          : result.code === 'FORBIDDEN' || result.code === 'PERMISSION_DENIED' || result.code === 'UNAUTHORIZED_RESOURCE'
            ? 403
            : result.code === 'INVALID_INPUT'
              ? 400
              : result.code === 'TIMEOUT'
                ? 408
                : 500;

      res.status(httpStatus).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getExecutions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as any;
      const userId = user?.id || (req as any).userId;
      const toolName = typeof req.query.toolName === 'string' ? req.query.toolName : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const result = await toolsController.getExecutions({ userId, toolName, limit });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getExecutionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'Execution ID is required.' } });
        return;
      }
      const result = await toolsController.getExecutionById(id);
      if (!result.success) {
        res.status(404).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const toolsExpressController = new ToolsExpressController();
