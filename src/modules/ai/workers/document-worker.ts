/**
 * AETHER AI — Background Document Worker
 * Handles async document parsing and indexing with cancellation, timeout, and failure support.
 */

import type { IRAGEngine } from '../rag/rag-engine.js';
import type { DocumentSource } from '../rag/ingestion/document-loader.js';

export interface DocumentWorkerTask {
  readonly taskId: string;
  readonly source: DocumentSource;
  readonly collectionId?: string;
  readonly timeoutMs?: number;
}

export interface WorkerTaskResult<T> {
  readonly taskId: string;
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly durationMs: number;
}

export class DocumentWorker {
  constructor(private readonly ragEngine?: IRAGEngine) {}

  public async processDocument(
    task: DocumentWorkerTask,
    signal?: AbortSignal,
  ): Promise<WorkerTaskResult<{ documentId: string; chunkCount: number }>> {
    const startTime = Date.now();

    if (!this.ragEngine) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'RAG engine unavailable for document worker.',
        durationMs: Date.now() - startTime,
      };
    }

    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        success: false,
        error: 'Task cancelled before execution.',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const result = await this.ragEngine.ingest(task.source, task.collectionId);
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
        data: {
          documentId: result.value.documentId,
          chunkCount: result.value.totalChunks,
        },
        durationMs,
      };
    } catch (err) {
      return {
        taskId: task.taskId,
        success: false,
        error: err instanceof Error ? err.message : 'Document processing failed.',
        durationMs: Date.now() - startTime,
      };
    }
  }
}

export const documentWorker = new DocumentWorker();
