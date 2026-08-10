/**
 * AETHER AI — Streaming Engine
 * Manages streaming output from LLM generation to the caller.
 * Handles chunking, heartbeats, and cancellation.
 */

import type { StreamingChunk, AIRequest } from '../ai-types.js';
import type { LLMStreamingChunk } from '../llm/llm-types.js';

// ─── Stream Subscriber ────────────────────────────────────────────────────────

export type StreamSubscriber = (chunk: StreamingChunk) => void;

// ─── IStreamingEngine Interface ───────────────────────────────────────────────

export interface IStreamingEngine {
  createStream(requestId: string, subscriber: StreamSubscriber): StreamHandle;
  onLLMChunk(handle: StreamHandle, llmChunk: LLMStreamingChunk): void;
  completeStream(handle: StreamHandle): void;
  failStream(handle: StreamHandle, reason: string): void;
  cancelStream(handle: StreamHandle): void;
}

// ─── Stream Handle ────────────────────────────────────────────────────────────

export interface StreamHandle {
  readonly requestId: string;
  readonly createdAt: number;
  isCancelled: boolean;
  isComplete: boolean;
  chunkCount: number;
}

// ─── Streaming Engine Implementation ─────────────────────────────────────────

export class StreamingEngine implements IStreamingEngine {
  private readonly subscribers = new Map<string, StreamSubscriber>();
  private readonly handles = new Map<string, StreamHandle>();
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly heartbeatIntervalMs: number;

  constructor(heartbeatIntervalMs = 15_000) {
    this.heartbeatIntervalMs = heartbeatIntervalMs;
  }

  public createStream(requestId: string, subscriber: StreamSubscriber): StreamHandle {
    const handle: StreamHandle = {
      requestId,
      createdAt: Date.now(),
      isCancelled: false,
      isComplete: false,
      chunkCount: 0,
    };

    this.handles.set(requestId, handle);
    this.subscribers.set(requestId, subscriber);

    // Start heartbeat to keep connection alive
    const timer = setInterval(() => {
      if (handle.isComplete || handle.isCancelled) {
        clearInterval(timer);
        return;
      }
      // Heartbeat chunk (empty delta) — signals connection is alive
      const heartbeat: StreamingChunk = {
        requestId,
        delta: '',
        index: handle.chunkCount++,
        isLast: false,
        status: 'streaming',
        timestamp: Date.now(),
      };
      subscriber(heartbeat);
    }, this.heartbeatIntervalMs);

    this.heartbeatTimers.set(requestId, timer);
    return handle;
  }

  public onLLMChunk(handle: StreamHandle, llmChunk: LLMStreamingChunk): void {
    if (handle.isCancelled || handle.isComplete) return;

    const subscriber = this.subscribers.get(handle.requestId);
    if (!subscriber) return;

    if (llmChunk.delta.length === 0 && !llmChunk.isLast) return;

    const streamChunk: StreamingChunk = {
      requestId: handle.requestId,
      delta: llmChunk.delta,
      index: handle.chunkCount++,
      isLast: llmChunk.isLast,
      status: llmChunk.isLast ? 'completed' : 'streaming',
      timestamp: Date.now(),
    };

    subscriber(streamChunk);

    if (llmChunk.isLast) {
      this.cleanup(handle.requestId);
      (handle as { isComplete: boolean }).isComplete = true;
    }
  }

  public completeStream(handle: StreamHandle): void {
    if (handle.isCancelled || handle.isComplete) return;

    const subscriber = this.subscribers.get(handle.requestId);
    if (subscriber) {
      subscriber({
        requestId: handle.requestId,
        delta: '',
        index: handle.chunkCount,
        isLast: true,
        status: 'completed',
        timestamp: Date.now(),
      });
    }

    (handle as { isComplete: boolean }).isComplete = true;
    this.cleanup(handle.requestId);
  }

  public failStream(handle: StreamHandle, _reason: string): void {
    if (handle.isCancelled || handle.isComplete) return;

    const subscriber = this.subscribers.get(handle.requestId);
    if (subscriber) {
      subscriber({
        requestId: handle.requestId,
        delta: '',
        index: handle.chunkCount,
        isLast: true,
        status: 'failed',
        timestamp: Date.now(),
      });
    }

    (handle as { isComplete: boolean }).isComplete = true;
    this.cleanup(handle.requestId);
  }

  public cancelStream(handle: StreamHandle): void {
    if (handle.isComplete) return;
    (handle as { isCancelled: boolean }).isCancelled = true;

    const subscriber = this.subscribers.get(handle.requestId);
    if (subscriber) {
      subscriber({
        requestId: handle.requestId,
        delta: '',
        index: handle.chunkCount,
        isLast: true,
        status: 'cancelled',
        timestamp: Date.now(),
      });
    }

    this.cleanup(handle.requestId);
  }

  private cleanup(requestId: string): void {
    const timer = this.heartbeatTimers.get(requestId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(requestId);
    }
    this.subscribers.delete(requestId);
    this.handles.delete(requestId);
  }

  public destroy(): void {
    for (const [, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();
    this.subscribers.clear();
    this.handles.clear();
  }
}
