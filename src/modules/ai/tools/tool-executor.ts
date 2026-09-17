/**
 * AETHER AI — Tool Executor
 * Orchestrates: Registry → Permissions → Validator → Handler → Typed Result.
 * Never executes arbitrary LLM-generated code.
 * Model-generated input always passes through validation and permission checks.
 */

import crypto from 'node:crypto';
import { performance } from 'perf_hooks';
import type { IToolRegistry } from './tool-registry.js';
import { toolRegistry } from './tool-registry.js';
import type { IToolValidator } from './tool-validator.js';
import { toolValidator } from './tool-validator.js';
import type { IToolPermissions } from './tool-permissions.js';
import { toolPermissions } from './tool-permissions.js';
import type {
  ToolExecutionContext,
  ToolResult,
  ToolResultCode,
  ActionRiskLevel,
  ToolExecutionOptions,
  ActionState,
  ToolResultMetadata,
} from './tool-types.js';
import type { VerificationStatus } from '../ai-types.js';

// Trigger tool auto-registration
import './automation-tools.js';
import './project-tools.js';
import './task-tools.js';
import './goal-tools.js';
import './productivity-tools.js';
import './knowledge-tools.js';
import './workspace-tools.js';
import './note-tools.js';
import './memory-tools.js';
import { actionAuditLogger } from '../audit/action-audit-logger.js';
import type { IToolProvider } from '../interfaces/core-contracts.js';
import type { ToolDefinition, ToolValidationResult } from './tool-types.js';
import { metrics } from '../observability/metrics.js';
import { tracer } from '../observability/tracing.js';

// ─── IToolExecutor Interface ─────────────────────────────────────────────────

export interface IToolExecutor extends IToolProvider {
  execute<TOutput = unknown>(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    options?: ToolExecutionOptions,
  ): Promise<ToolResult<TOutput>>;
  listTools?(): readonly ToolDefinition[];
  getTool?(toolName: string): ToolDefinition | undefined;
  validateAction?(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): ToolValidationResult;
  clearIdempotencyCache(): void;
}

// ─── Tool Executor Implementation ────────────────────────────────────────────

export class ToolExecutor implements IToolExecutor, IToolProvider {
  private readonly idempotencyCache = new Map<string, ToolResult>();

  constructor(
    private readonly registry: IToolRegistry,
    private readonly permissions: IToolPermissions,
    private readonly validator: IToolValidator,
  ) {}

  public listTools(): readonly ToolDefinition[] {
    return this.registry.getAll();
  }

  public getTool(toolName: string): ToolDefinition | undefined {
    return this.registry.get(toolName);
  }

  public validateAction(
    toolName: string,
    input: Record<string, unknown>,
    _context?: ToolExecutionContext,
  ): ToolValidationResult {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`Tool "${toolName}" not found.`] };
    }
    return this.validator.validate(input, tool.inputSchema);
  }

  public async execute<TOutput = unknown>(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    options: ToolExecutionOptions = {},
  ): Promise<ToolResult<TOutput>> {
    const startTime = performance.now();
    const executionId = crypto.randomUUID();
    const correlationId = context.correlationId || context.traceId;

    // 0. Idempotency Check
    const idempotencyKey = options.idempotencyKey;
    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      const cachedResult = this.idempotencyCache.get(idempotencyKey)!;
      return {
        ...(cachedResult as ToolResult<TOutput>),
        cached: true,
      };
    }

    // 1. Resolve tool from registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      const res = this.buildResult<TOutput>(
        false,
        'TOOL_NOT_FOUND',
        startTime,
        undefined,
        `Tool "${toolName}" not found in registry.`,
        false,
        undefined,
        'READ_ONLY',
        'FAILED',
        0,
        'FAILED',
        {
          toolId: `tool_${toolName}`,
          executionId,
          correlationId,
        },
      );
      await this.logAudit(toolName, input, context, res, false, 'Tool not found');
      return res;
    }

    const riskLevel = tool.riskLevel ?? 'READ_ONLY';
    const toolId = tool.id ?? `tool_${toolName}`;

    // 2. Check permissions
    const permCheck = this.permissions.checkPermissions(tool.requiredPermissions, context.auth);
    if (!permCheck.allowed) {
      const res = this.buildResult<TOutput>(
        false,
        'FORBIDDEN',
        startTime,
        undefined,
        `Unauthorized to execute tool "${toolName}". Missing: [${permCheck.missingPermissions.join(', ')}].`,
        false,
        undefined,
        riskLevel,
        'DENIED',
        0,
        'FAILED',
        {
          toolId,
          executionId,
          correlationId,
        },
      );
      await this.logAudit(toolName, input, context, res, false, 'Permission denied');
      return res;
    }

    // 3. Validate input
    const validation = this.validator.validate(input, tool.inputSchema);
    if (!validation.valid) {
      const res = this.buildResult<TOutput>(
        false,
        'INVALID_INPUT',
        startTime,
        undefined,
        `Invalid input for tool "${toolName}": ${validation.errors.join('; ')}.`,
        false,
        undefined,
        riskLevel,
        'FAILED',
        0,
        'FAILED',
        {
          toolId,
          executionId,
          correlationId,
        },
      );
      await this.logAudit(toolName, input, context, res, false, 'Invalid input');
      return res;
    }

    // 4. Check cancellation
    const activeSignal = options.signal || context.signal;
    if (activeSignal?.aborted) {
      const res = this.buildResult<TOutput>(
        false,
        'CANCELLED',
        startTime,
        undefined,
        `Tool execution cancelled before start.`,
        false,
        undefined,
        riskLevel,
        'CANCELLED',
        0,
        'FAILED',
        {
          toolId,
          executionId,
          correlationId,
        },
      );
      await this.logAudit(toolName, input, context, res, false, 'Cancelled');
      return res;
    }

    // 5. Execution with safe retry policy
    const isReadOperation = riskLevel === 'READ_ONLY' || riskLevel === 'READ';
    const isRetryable = tool.retryable === true || isReadOperation;
    const maxRetries = isRetryable ? (options.maxRetries ?? (isReadOperation ? 1 : 0)) : 0;
    const timeoutMs = options.timeoutMs ?? tool.timeoutMs ?? 30_000;

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const data = await this.executeWithTimeout(
          () => tool.handler(input, context),
          timeoutMs,
          activeSignal,
        );

        // 6. Backend Verification Step
        let verified = true;
        let verificationStatus: VerificationStatus = 'NOT_VERIFIABLE';
        let verificationDetails = 'Action completed. Downstream state verification not applicable.';

        if (typeof tool.verify === 'function') {
          const verifyRes = await tool.verify(data, input, context);
          verified = verifyRes.verified;
          if (!verified) {
            const verifyError =
              verifyRes.error ?? 'Backend verification failed: resource state mismatch.';
            const res = this.buildResult<TOutput>(
              false,
              'VERIFICATION_FAILED',
              startTime,
              undefined,
              `Verification failed for tool "${toolName}": ${verifyError}`,
              false,
              verifyRes.details ?? verifyError,
              riskLevel,
              'FAILED',
              attempt - 1,
              'FAILED',
              {
                toolId,
                executionId,
                correlationId,
              },
            );
            await this.logAudit(toolName, input, context, res, false, verifyError);
            return res;
          }
          verificationStatus = verifyRes.status ?? 'VERIFIED';
          verificationDetails = verifyRes.details ?? 'Action completed and verified by backend.';
        } else {
          // If tool has no verify function, mark as NOT_VERIFIABLE
          if (isReadOperation) {
            verificationStatus = 'NOT_VERIFIABLE';
            verificationDetails = 'Read operation executed successfully. Downstream persistent state was not modified.';
          } else {
            verificationStatus = 'NOT_VERIFIABLE';
            verificationDetails = 'Action executed successfully. Direct backend state verification was not configured.';
          }
        }

        const res = this.buildResult<TOutput>(
          true,
          'SUCCESS',
          startTime,
          data as TOutput,
          undefined,
          verified,
          verificationDetails,
          riskLevel,
          'COMPLETED',
          attempt - 1,
          verificationStatus,
          {
            toolId,
            executionId,
            correlationId,
          },
        );

        // Cache idempotent results
        if (idempotencyKey) {
          this.idempotencyCache.set(idempotencyKey, res);
        }

        await this.logAudit(toolName, input, context, res, verified, verificationDetails);
        return res;
      } catch (err) {
        lastError = err;

        // If cancelled or aborted, do not retry
        if (err instanceof Error && (err.message === 'TOOL_CANCELLED' || activeSignal?.aborted)) {
          const res = this.buildResult<TOutput>(
            false,
            'CANCELLED',
            startTime,
            undefined,
            `Tool "${toolName}" was cancelled.`,
            false,
            undefined,
            riskLevel,
            'CANCELLED',
            attempt - 1,
            'FAILED',
            {
              toolId,
              executionId,
              correlationId,
            },
          );
          await this.logAudit(toolName, input, context, res, false, 'Cancelled');
          return res;
        }

        // If not retryable or max retries reached, exit loop and handle error
        if (!isRetryable || attempt > maxRetries) {
          break;
        }
      }
    }

    // Handle failure after all retry attempts
    if (lastError instanceof Error && lastError.message === 'TOOL_TIMEOUT') {
      const res = this.buildResult<TOutput>(
        false,
        'TIMEOUT',
        startTime,
        undefined,
        `Tool "${toolName}" timed out.`,
        false,
        undefined,
        riskLevel,
        'TIMED_OUT',
        attempt - 1,
        'FAILED',
        {
          toolId,
          executionId,
          correlationId,
        },
      );
      await this.logAudit(toolName, input, context, res, false, 'Timeout');
      return res;
    }

    const errorMsg =
      lastError instanceof Error ? lastError.message : 'Unknown tool execution error.';
    let errorCode: ToolResultCode = 'TOOL_EXECUTION_FAILED';
    let actionState: ActionState = 'FAILED';
    const lowerMsg = errorMsg.toLowerCase();
    if (
      lowerMsg.includes('access denied') ||
      lowerMsg.includes('unauthorized') ||
      lowerMsg.includes('belongs to another tenant')
    ) {
      errorCode = 'UNAUTHORIZED_RESOURCE';
      actionState = 'DENIED';
    } else if (lowerMsg.includes('authentication required') || lowerMsg.includes('forbidden')) {
      errorCode = 'PERMISSION_DENIED';
      actionState = 'DENIED';
    }

    const res = this.buildResult<TOutput>(
      false,
      errorCode,
      startTime,
      undefined,
      `Tool "${toolName}" failed: ${errorMsg}`,
      false,
      undefined,
      riskLevel,
      actionState,
      attempt - 1,
      'FAILED',
      {
        toolId,
        executionId,
        correlationId,
      },
    );
    await this.logAudit(toolName, input, context, res, false, errorMsg);
    return res;
  }

  public clearIdempotencyCache(): void {
    this.idempotencyCache.clear();
  }

  private async logAudit<T>(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    result: ToolResult<T>,
    verified: boolean,
    details?: string,
  ): Promise<void> {
    try {
      // Redact sensitive credentials/passwords from audit inputs
      const sanitizedInput = this.sanitizeAuditInput(input);

      await actionAuditLogger.log({
        id: result.metadata?.executionId,
        executionId: result.metadata?.executionId,
        correlationId: context.correlationId || context.traceId,
        planId: (context as any).planId,
        stepId: (context as any).stepId,
        workspaceId: context.auth.workspaceId,
        userId: context.auth.userId,
        sessionId: context.auth.sessionId,
        conversationId: context.conversationId,
        traceId: context.traceId,
        toolName,
        actionType: 'TOOL_EXECUTION',
        input: sanitizedInput,
        result: result.data,
        verified,
        verificationDetails: details,
        riskLevel: result.riskLevel ?? 'READ_ONLY',
        status: result.success ? 'SUCCESS' : (result.code as any),
        error: result.error,
        executionTimeMs: result.executionTimeMs,
      });
    } catch {
      // Audit logging errors should not break tool execution
    }
  }

  private sanitizeAuditInput(input: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = new Set([
      'password',
      'token',
      'secret',
      'apikey',
      'api_key',
      'accesstoken',
      'access_token',
      'refreshtoken',
      'refresh_token',
      'authorization',
      'jwt',
      'bearer',
      'cookie',
      'privatekey',
      'private_key',
    ]);

    for (const [key, value] of Object.entries(input)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeAuditInput(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('TOOL_TIMEOUT'));
        }
      }, timeoutMs);

      const onAbort = (): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('TOOL_CANCELLED'));
        }
      };

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(new Error('TOOL_CANCELLED'));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      fn()
        .then((result) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onAbort);
            resolve(result);
          }
        })
        .catch((err: unknown) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onAbort);
            reject(err);
          }
        });
    });
  }

  private buildResult<T>(
    success: boolean,
    code: ToolResultCode,
    startTime: number,
    data?: T,
    error?: string,
    verified?: boolean,
    verificationDetails?: string,
    riskLevel?: ActionRiskLevel,
    actionState?: ActionState,
    retryCount?: number,
    verificationStatus?: VerificationStatus,
    metadata?: ToolResultMetadata,
  ): ToolResult<T> {
    const durationMs = performance.now() - startTime;
    const vStatus: VerificationStatus =
      verificationStatus ??
      (!success
        ? 'FAILED'
        : verified
          ? 'VERIFIED'
          : 'UNVERIFIED');

    const rawToolName = metadata?.toolId?.replace(/^tool_/, '') || 'unknown_tool';
    metrics.recordToolRequest(rawToolName);
    metrics.recordToolDuration(rawToolName, durationMs, success);
    if (!success) {
      metrics.recordToolFailure(rawToolName, code);
      if (code === 'FORBIDDEN') {
        metrics.recordToolDenial(rawToolName, 'FORBIDDEN');
      }
      if (code === 'TIMEOUT') {
        metrics.recordToolTimeout(rawToolName);
      }
      if (code === 'VERIFICATION_FAILED') {
        metrics.recordToolVerificationFailure(rawToolName);
      }
    }

    return {
      success,
      code,
      data,
      error,
      executionTimeMs: durationMs,
      verified,
      verificationStatus: vStatus,
      verificationDetails,
      riskLevel,
      actionState: actionState ?? (success ? 'COMPLETED' : 'FAILED'),
      retryCount,
      metadata: metadata
        ? {
            ...metadata,
            durationMs,
          }
        : undefined,
    };
  }
}

export const toolExecutor = new ToolExecutor(toolRegistry, toolPermissions, toolValidator);
