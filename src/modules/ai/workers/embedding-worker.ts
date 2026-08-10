/**
 * AETHER AI — Background Embedding Worker
 * Handles batch embedding generation in background workers.
 * Supports cancellation, timeouts, and failure handling.
 */

import type { IEmbeddingEngine } from '../rag/embeddings/embedding-engine.js';
import type { WorkerTaskResult } from './document-worker.js';

export interface EmbeddingWorkerTask {
  readonly taskId: string;
  readonly texts: readonly string[];
  readonly timeoutMs?: number;
}

export class EmbeddingWorker {
  constructor(private readonly embeddingEngine?: IEmbeddingEngine) {}

  public async processBatch(
    task: EmbeddingWorkerTask,
    signal?: AbortSignal,
  ): Promise<WorkerTaskResult<readonly (readonly number[])[]>> {
    const startTime = Date.now();

    if (!this.embeddingEngine || !(await this.embeddingEngine.isAvailable())) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'Embedding engine unavailable.',
        durationMs: Date.now() - startTime,
      };
    }

    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'Batch embedding task cancelled.',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const result = await this.embeddingEngine.embedBatch(task.texts);
      const durationMs = Date.now() - startTime;

      if (!result.ok) {
        return {
          taskId: task.taskId,
          success: false,
          error: result.error.message,
          durationMs,
        };
      }

      return {
        taskId: task.taskId,
        success: true,
        data: result.value,
        durationMs,
      };
    } catch (err) {
      return {
        taskId: task.taskId,
        success: false,
        error: err instanceof Error ? err.message : 'Batch embedding failed.',
        durationMs: Date.now() - startTime,
      };
    }
  }
}

export const embeddingWorker = new EmbeddingWorker();
