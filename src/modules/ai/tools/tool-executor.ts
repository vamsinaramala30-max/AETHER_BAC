/**
 * AETHER AI — Tool Executor
 * Orchestrates: Registry → Permissions → Validator → Handler → Typed Result.
 * Never executes arbitrary LLM-generated code.
 * Model-generated input always passes through validation and permission checks.
 */

import { performance } from 'perf_hooks';
import type { IToolRegistry } from './tool-registry.js';
import { toolRegistry } from './tool-registry.js';
import type { IToolValidator } from './tool-validator.js';
import { toolValidator } from './tool-validator.js';
import type { IToolPermissions } from './tool-permissions.js';
import { toolPermissions } from './tool-permissions.js';
import type { ToolExecutionContext, ToolResult, ToolResultCode } from './tool-types.js';

// ─── IToolExecutor Interface ─────────────────────────────────────────────────

export interface IToolExecutor {
  execute<TOutput = unknown>(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult<TOutput>>;
}

// ─── Tool Executor Implementation ────────────────────────────────────────────

export class ToolExecutor implements IToolExecutor {
  constructor(
    private readonly registry: IToolRegistry,
    private readonly permissions: IToolPermissions,
    private readonly validator: IToolValidator,
  ) {}

  public async execute<TOutput = unknown>(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult<TOutput>> {
    const startTime = performance.now();

    // 1. Resolve tool from registry
    const tool = this.registry.get(toolName);
    if (!tool) {
      return this.buildResult<TOutput>(false, 'TOOL_NOT_FOUND', startTime, undefined, `Tool "${toolName}" not found in registry.`);
    }

    // 2. Check permissions
    const permCheck = this.permissions.checkPermissions(tool.requiredPermissions, context.auth);
    if (!permCheck.allowed) {
      return this.buildResult<TOutput>(
        false,
        'FORBIDDEN',
        startTime,
        undefined,
        `Unauthorized to execute tool "${toolName}". Missing: [${permCheck.missingPermissions.join(', ')}].`,
      );
    }

    // 3. Validate input
    const validation = this.validator.validate(input, tool.inputSchema);
    if (!validation.valid) {
      return this.buildResult<TOutput>(
        false,
        'INVALID_INPUT',
        startTime,
        undefined,
        `Invalid input for tool "${toolName}": ${validation.errors.join('; ')}.`,
      );
    }

    // 4. Check cancellation
    if (context.signal?.aborted) {
      return this.buildResult<TOutput>(false, 'CANCELLED', startTime, undefined, `Tool execution cancelled before start.`);
    }

    // 5. Execute handler with timeout
    try {
      const timeoutMs = tool.timeoutMs ?? 30_000;
      const data = await this.executeWithTimeout(
        () => tool.handler(input, context),
        timeoutMs,
        context.signal,
      );
      return this.buildResult<TOutput>(true, 'SUCCESS', startTime, data as TOutput);
    } catch (err) {
      if (err instanceof Error && err.message === 'TOOL_TIMEOUT') {
        return this.buildResult<TOutput>(false, 'TIMEOUT', startTime, undefined, `Tool "${toolName}" timed out.`);
      }
      if (err instanceof Error && err.message === 'TOOL_CANCELLED') {
        return this.buildResult<TOutput>(false, 'CANCELLED', startTime, undefined, `Tool "${toolName}" was cancelled.`);
      }
      const errorMsg = err instanceof Error ? err.message : 'Unknown tool execution error.';
      return this.buildResult<TOutput>(false, 'TOOL_EXECUTION_FAILED', startTime, undefined, `Tool "${toolName}" failed: ${errorMsg}`);
    }
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
  ): ToolResult<T> {
    return {
      success,
      code,
      data,
      error,
      executionTimeMs: performance.now() - startTime,
    };
  }
}

export const toolExecutor = new ToolExecutor(toolRegistry, toolPermissions, toolValidator);
