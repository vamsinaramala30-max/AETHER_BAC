/**
 * AETHER AI — Background Agent Worker
 * Executes multi-step AI agent workflows asynchronously in background workers.
 * Supports cancellation, timeout, and failure handling.
 */

import { AgentEngine } from '../agents/agent-engine.js';
import type { AgentRunResult } from '../agents/agent-types.js';
import type { AuthenticationContext } from '../tools/tool-types.js';
import type { WorkerTaskResult } from './document-worker.js';

export interface AgentWorkerTask {
  readonly taskId: string;
  readonly agentId: string;
  readonly goal: string;
  readonly auth: AuthenticationContext;
  readonly timeoutMs?: number;
}

export class AgentWorker {
  private readonly agentEngine = new AgentEngine();

  public async processTask(
    task: AgentWorkerTask,
    signal?: AbortSignal,
  ): Promise<WorkerTaskResult<AgentRunResult>> {
    const startTime = Date.now();

    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'Agent task cancelled before execution.',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const result = await this.agentEngine.executeAgent(task.agentId, task.goal, task.auth, {
        signal,
        timeoutMs: task.timeoutMs,
      });

      return {
        taskId: task.taskId,
        success: result.status === 'completed',
        data: result,
        error: result.error,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        taskId: task.taskId,
        success: false,
        error: err instanceof Error ? err.message : 'Agent task execution failed.',
        durationMs: Date.now() - startTime,
      };
    }
  }
}

export const agentWorker = new AgentWorker();
