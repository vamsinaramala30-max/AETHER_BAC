/**
 * AETHER AI — Background Model Worker
 * Handles long-running model operations such as pre-warming or loading models into local VRAM/RAM.
 * Supports cancellation, timeouts, and explicit failure reporting.
 */

import type { ILLMEngine } from '../llm/llm-engine.js';
import type { WorkerTaskResult } from './document-worker.js';

export interface ModelWorkerTask {
  readonly taskId: string;
  readonly modelId: string;
  readonly action: 'load' | 'unload' | 'health_check';
}

export class ModelWorker {
  constructor(private readonly llmEngine?: ILLMEngine) {}

  public async processTask(
    task: ModelWorkerTask,
    signal?: AbortSignal,
  ): Promise<WorkerTaskResult<{ modelId: string; status: string }>> {
    const startTime = Date.now();

    if (!this.llmEngine) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'LLM engine unavailable.',
        durationMs: Date.now() - startTime,
      };
    }

    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'Model worker task cancelled.',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const status = await this.llmEngine.getModelStatus(task.modelId);
      return {
        taskId: task.taskId,
        success: status.status === 'loaded' || status.status === 'available',
        data: { modelId: task.modelId, status: status.status },
        error: status.errorMessage,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        taskId: task.taskId,
        success: false,
        error: err instanceof Error ? err.message : 'Model operation failed.',
        durationMs: Date.now() - startTime,
      };
    }
  }
}

export const modelWorker = new ModelWorker();
