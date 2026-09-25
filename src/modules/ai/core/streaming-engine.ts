/**
 * AETHER AI — Streaming Engine
 * Manages streaming output from LLM generation to the caller.
 * Handles chunking, heartbeats, and cancellation.
 */

import type { StreamingChunk, StreamingStatus, VerificationStatus, ConfirmationRequest, AIRequest } from '../ai-types.js';
import type { LLMStreamingChunk } from '../llm/llm-types.js';

// ─── Stream Subscriber ────────────────────────────────────────────────────────

export type StreamSubscriber = (chunk: StreamingChunk) => void | Promise<void>;

// ─── IStreamingEngine Interface ───────────────────────────────────────────────

export interface IStreamingEngine {
  createStream(requestId: string, subscriber: StreamSubscriber): StreamHandle;
  onLLMChunk(handle: StreamHandle, llmChunk: LLMStreamingChunk): void | Promise<void>;
  emitStatus?(
    handle: StreamHandle,
    status: StreamingStatus,
    metadata?: {
      toolName?: string;
      verified?: boolean;
      verificationStatus?: VerificationStatus;
      delta?: string;
      details?: string;
      confirmationRequest?: ConfirmationRequest;
      error?: unknown;
    },
  ): void | Promise<void>;
  completeStream(handle: StreamHandle): void | Promise<void>;
  failStream(
    handle: StreamHandle,
    reason: string,
    metadata?: {
      toolName?: string;
      verified?: boolean;
      verificationStatus?: VerificationStatus;
      details?: string;
      error?: unknown;
    },
  ): void | Promise<void>;
  cancelStream(handle: StreamHandle): void | Promise<void>;
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
      void subscriber(heartbeat);
    }, this.heartbeatIntervalMs);

    this.heartbeatTimers.set(requestId, timer);
    return handle;
  }

  public async onLLMChunk(handle: StreamHandle, llmChunk: LLMStreamingChunk): Promise<void> {
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

    await subscriber(streamChunk);

    if (llmChunk.isLast) {
      this.cleanup(handle.requestId);
      (handle as { isComplete: boolean }).isComplete = true;
    }
  }

  public async emitStatus(
    handle: StreamHandle,
    status: StreamingStatus,
    metadata?: {
      toolName?: string;
      verified?: boolean;
      verificationStatus?: VerificationStatus;
      delta?: string;
      details?: string;
      confirmationRequest?: ConfirmationRequest;
      error?: unknown;
    },
  ): Promise<void> {
    if (handle.isCancelled || handle.isComplete) return;

    const subscriber = this.subscribers.get(handle.requestId);
    if (!subscriber) return;

    const chunk: StreamingChunk = {
      requestId: handle.requestId,
      delta: metadata?.delta ?? '',
      index: handle.chunkCount++,
      isLast: false,
      status,
      timestamp: Date.now(),
      toolName: metadata?.toolName,
      verified: metadata?.verified,
      verificationStatus: metadata?.verificationStatus,
      details: metadata?.details,
      confirmationRequest: metadata?.confirmationRequest,
      error: metadata?.error,
    };

    await subscriber(chunk);
  }

  public async completeStream(handle: StreamHandle): Promise<void> {
    if (handle.isCancelled || handle.isComplete) return;

    const subscriber = this.subscribers.get(handle.requestId);
    if (subscriber) {
      await subscriber({
        requestId: handle.requestId,
        delta: '',
        index: handle.chunkCount++,
        isLast: true,
        status: 'completed',
        timestamp: Date.now(),
      });
    }

    (handle as { isComplete: boolean }).isComplete = true;
    this.cleanup(handle.requestId);
  }

  public async failStream(
    handle: StreamHandle,
    reason: string,
    metadata?: {
      toolName?: string;
      verified?: boolean;
      verificationStatus?: VerificationStatus;
      details?: string;
      error?: unknown;
    },
  ): Promise<void> {
    if (handle.isCancelled || handle.isComplete) return;

    const subscriber = this.subscribers.get(handle.requestId);
    if (subscriber) {
      await subscriber({
        requestId: handle.requestId,
        delta: '',
        index: handle.chunkCount++,
        isLast: true,
        status: 'failed',
        timestamp: Date.now(),
        toolName: metadata?.toolName,
        verified: metadata?.verified ?? false,
        verificationStatus: metadata?.verificationStatus ?? 'FAILED',
        details: metadata?.details ?? reason,
        error: metadata?.error ?? reason,
      });
    }

    (handle as { isComplete: boolean }).isComplete = true;
    this.cleanup(handle.requestId);
  }

  public async cancelStream(handle: StreamHandle): Promise<void> {
    if (handle.isComplete || handle.isCancelled) return;
    (handle as { isCancelled: boolean }).isCancelled = true;

    const subscriber = this.subscribers.get(handle.requestId);
    if (subscriber) {
      await subscriber({
        requestId: handle.requestId,
        delta: '',
        index: handle.chunkCount++,
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
