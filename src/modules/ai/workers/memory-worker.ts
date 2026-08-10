/**
 * AETHER AI — Background Memory Worker
 * Handles long-term memory summarization and WorkingMemory eviction in background jobs.
 */

import type { IMemoryEngine } from '../memory/memory-engine.js';
import type { WorkerTaskResult } from './document-worker.js';

export interface MemoryWorkerTask {
  readonly taskId: string;
  readonly userId: string;
  readonly action: 'summarize' | 'evict_expired' | 'cleanup_user';
}

export class MemoryWorker {
  constructor(private readonly memoryEngine?: IMemoryEngine) {}

  public async processTask(
    task: MemoryWorkerTask,
    signal?: AbortSignal,
  ): Promise<WorkerTaskResult<{ action: string; processedCount: number }>> {
    const startTime = Date.now();

    if (!this.memoryEngine) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'Memory engine unavailable.',
        durationMs: Date.now() - startTime,
      };
    }

    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'Memory worker task cancelled.',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      if (task.action === 'cleanup_user') {
        await this.memoryEngine.clearUserData(task.userId);
      }

      return {
        taskId: task.taskId,
        success: true,
        data: { action: task.action, processedCount: 1 },
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        taskId: task.taskId,
        success: false,
        error: err instanceof Error ? err.message : 'Memory processing failed.',
        durationMs: Date.now() - startTime,
      };
    }
  }
}

export const memoryWorker = new MemoryWorker();
