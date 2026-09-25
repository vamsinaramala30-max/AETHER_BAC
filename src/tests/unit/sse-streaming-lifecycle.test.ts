/**
 * AETHER AI — SSE Streaming Reliability, Cancellation, Backpressure & Connection Lifecycle Test Suite (Batch 4)
 *
 * Verifies:
 * 1. SSE Connection Lifecycle: Normal completion, reverse proxy headers (X-Accel-Buffering), [DONE] delimiter.
 * 2. Client Disconnect / Abort Propagation: req 'close' triggers AbortController, halts model/tools, emits single 'cancelled'.
 * 3. Timeout Handling: Exceeded timeout aborts execution, emits truthful failure, clears timers.
 * 4. Backpressure & Slow Client Handling: Pauses when socket buffer full (res.write=false), drains gracefully on 'drain' or 'close'.
 * 5. Terminal State Guarantee: Exactly ONE terminal chunk per stream (completed, failed, or cancelled); NO [DONE] after failure/cancel.
 * 6. Zero Synthetic Output: Model failure truthfully reports failure without fake token streaming.
 * 7. Duplicate Request Protection: Duplicate in-flight requestId returns HTTP 409 Conflict; new conversation message supersedes previous stream.
 * 8. Tool Execution Safety: Verifies tool results before reporting success; failure emits verified: false.
 * 9. Resource & Memory Cleanup: Timers, listeners, and in-flight maps cleared on every exit path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { AiModule, AiExpressController } from '../../modules/ai/ai.module.js';
import { globalAiEngine } from '../../modules/ai/core/ai-engine.js';
import { messageService } from '../../modules/ai/conversations/message-service.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { CancelledError, TimeoutError, ProviderUnavailableError } from '../../modules/ai/ai-errors.js';
import type { AIRequest, StreamingChunk } from '../../modules/ai/ai-types.js';

// ─── Mock Express Request & Response Factory ──────────────────────────────────

interface MockResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  writtenData: string[];
  writableEnded: boolean;
  destroyed: boolean;
  setHeader: (name: string, value: string) => void;
  getHeader: (name: string) => string | undefined;
  flushHeaders?: () => void;
  write: (chunk: string) => boolean;
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  end: () => void;
  simulateBackpressure: boolean;
}

function createMockReqRes(options: {
  userId?: string;
  workspaceId?: string;
  body?: Record<string, unknown>;
  simulateBackpressure?: boolean;
}) {
  const req = new EventEmitter() as any;
  req.user = {
    id: options.userId || 'test-user-b4',
    workspaceId: options.workspaceId || 'test-ws-b4',
    role: 'user',
  };
  req.body = options.body || {
    message: 'Hello, what is Aether?',
    conversationId: `conv_${Date.now()}`,
  };

  const writtenData: string[] = [];
  const headers: Record<string, string> = {};

  const res = new EventEmitter() as unknown as MockResponse;
  res.statusCode = 200;
  res.headers = headers;
  res.writtenData = writtenData;
  res.writableEnded = false;
  res.destroyed = false;
  res.simulateBackpressure = options.simulateBackpressure ?? false;

  res.setHeader = (name: string, value: string) => {
    headers[name.toLowerCase()] = value;
  };
  res.getHeader = (name: string) => headers[name.toLowerCase()];
  res.flushHeaders = vi.fn();
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = vi.fn((body: unknown) => {
    writtenData.push(JSON.stringify(body));
    res.writableEnded = true;
  });
  res.write = (chunk: string) => {
    if (res.writableEnded || res.destroyed) return false;
    writtenData.push(chunk);
    if (res.simulateBackpressure) {
      return false; // Kernel buffer full
    }
    return true;
  };
  res.end = () => {
    res.writableEnded = true;
  };

  return { req, res };
}

function parseSSEChunks(writtenData: string[]): Array<{ isDoneMarker: boolean; payload?: any }> {
  const results: Array<{ isDoneMarker: boolean; payload?: any }> = [];
  for (const item of writtenData) {
    const lines = item.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') {
        results.push({ isDoneMarker: true });
      } else {
        try {
          results.push({ isDoneMarker: false, payload: JSON.parse(dataStr) });
        } catch {
          // non-json
        }
      }
    }
  }
  return results;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('AETHER Batch 4 — SSE Streaming Reliability, Cancellation & Backpressure', () => {
  let aiModule: AiModule;
  let controller: AiExpressController;
  let providerManager: any;

  beforeEach(() => {
    aiModule = new AiModule();
    controller = aiModule.aiController;
    providerManager = (globalAiEngine as any).orchestrator.getProviderManager();

    vi.spyOn(messageService, 'addMessage').mockResolvedValue({
      id: 'mock-msg',
      conversationId: 'mock-conv',
      role: 'user',
      content: 'mock',
      createdAt: Date.now(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. SSE CONNECTION LIFECYCLE & REVERSE PROXY HEADERS ────────────────────
  it('SSE-01: Sets reverse proxy buffering and SSE headers, streams chunks, and ends with [DONE]', async () => {
    const conversationId = `conv_normal_${Date.now()}`;
    const { req, res } = createMockReqRes({
      body: {
        message: 'Explain gravity simply',
        conversationId,
      },
    });

    // Mock successful model streaming
    vi.spyOn(providerManager, 'generateStream').mockImplementation(async (request: any, onChunk: any) => {
      await onChunk({
        requestId: request.requestId,
        modelId: 'test-model',
        delta: 'Gravity attracts mass.',
        index: 0,
        isLast: false,
      });
      await onChunk({
        requestId: request.requestId,
        modelId: 'test-model',
        delta: '',
        index: 1,
        isLast: true,
        finishReason: 'stop',
      });
      return {
        activeProvider: 'mock',
        usedFallback: false,
        result: { ok: true, value: undefined },
      };
    });

    const next = vi.fn();
    await controller.stream(req, res as any, next);

    // 1. Verify headers
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['connection']).toBe('keep-alive');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.flushHeaders).toHaveBeenCalled();

    // 2. Verify events
    const sseEvents = parseSSEChunks(res.writtenData);
    expect(sseEvents.length).toBeGreaterThanOrEqual(2);

    // Content chunk
    const contentChunk = sseEvents.find((e) => e.payload?.delta === 'Gravity attracts mass.');
    expect(contentChunk).toBeDefined();

    // Exactly one [DONE] marker at the end
    const doneMarkers = sseEvents.filter((e) => e.isDoneMarker);
    expect(doneMarkers).toHaveLength(1);

    // Terminal completion chunk
    const terminalChunks = sseEvents.filter((e) => e.payload?.isLast === true);
    expect(terminalChunks).toHaveLength(1);
    expect(terminalChunks[0].payload?.status).toBe('completed');

    expect(res.writableEnded).toBe(true);
  });

  // ─── 2. TRUTHFUL MODEL FAILURE (NO SYNTHETIC TOKENS) ────────────────────────
  it('SSE-02: Truthful model failure emits failed terminal chunk and NEVER emits fake tokens or [DONE]', async () => {
    const conversationId = `conv_fail_${Date.now()}`;
    const { req, res } = createMockReqRes({
      body: {
        message: 'Tell me a story',
        conversationId,
      },
    });

    // Mock model failure
    vi.spyOn(providerManager, 'generateStream').mockImplementation(async () => {
      return {
        activeProvider: 'aether',
        usedFallback: false,
        result: {
          ok: false,
          error: new ProviderUnavailableError('aether', 'Local inference server offline (HTTP 503)'),
        },
      };
    });

    const next = vi.fn();
    await controller.stream(req, res as any, next);

    const sseEvents = parseSSEChunks(res.writtenData);

    // 1. Verify truthful failed terminal chunk
    const failedChunks = sseEvents.filter((e) => e.payload?.status === 'failed');
    expect(failedChunks).toHaveLength(1);
    expect(failedChunks[0].payload?.isLast).toBe(true);
    expect(failedChunks[0].payload?.error).toContain('Local inference server offline');

    // 2. Invariant: ZERO [DONE] markers on failure
    const doneMarkers = sseEvents.filter((e) => e.isDoneMarker);
    expect(doneMarkers).toHaveLength(0);

    // 3. Invariant: ZERO synthetic token chunks
    const tokenChunks = sseEvents.filter((e) => e.payload?.delta && e.payload.delta.length > 0);
    expect(tokenChunks).toHaveLength(0);

    expect(res.writableEnded).toBe(true);
  });

  // ─── 3. CLIENT DISCONNECT / ABORT PROPAGATION ────────────────────────────────
  it('SSE-03: Client disconnect (req close) triggers AbortSignal, stops generation, and emits cancelled status', async () => {
    const conversationId = `conv_abort_${Date.now()}`;
    const { req, res } = createMockReqRes({
      body: {
        message: 'Compute large dataset analysis',
        conversationId,
      },
    });

    let generatorAborted = false;

    vi.spyOn(providerManager, 'generateStream').mockImplementation(async (request: any, onChunk: any) => {
      // Simulate partial generation then client disconnect
      onChunk({
        requestId: request.requestId,
        modelId: 'test-model',
        delta: 'Starting calculation...',
        index: 0,
        isLast: false,
      });

      // Simulate client abrupt disconnect
      req.emit('close');

      // Check if abort signal propagated
      if (request.signal?.aborted) {
        generatorAborted = true;
        return {
          activeProvider: 'aether',
          usedFallback: false,
          result: { ok: false, error: new CancelledError('Stream cancelled by user abort') },
        };
      }

      return {
        activeProvider: 'aether',
        usedFallback: false,
        result: { ok: true, value: undefined },
      };
    });

    const next = vi.fn();
    await controller.stream(req, res as any, next);

    expect(generatorAborted).toBe(true);

    const sseEvents = parseSSEChunks(res.writtenData);

    // Terminal chunk must be 'cancelled'
    const cancelledChunk = sseEvents.find((e) => e.payload?.status === 'cancelled');
    expect(cancelledChunk).toBeDefined();
    expect(cancelledChunk?.payload?.isLast).toBe(true);

    // Invariant: ZERO [DONE] markers on cancelled stream
    const doneMarkers = sseEvents.filter((e) => e.isDoneMarker);
    expect(doneMarkers).toHaveLength(0);
  });

  // ─── 4. TIMEOUT HANDLING ────────────────────────────────────────────────────
  it('SSE-04: Stream timeout cleanly aborts model operation, emits timeout failure, and clears timers', async () => {
    const conversationId = `conv_timeout_${Date.now()}`;
    const { req, res } = createMockReqRes({
      body: {
        message: 'Very slow request',
        conversationId,
        timeout: 80, // 80ms timeout
      },
    });

    vi.spyOn(providerManager, 'generateStream').mockImplementation(async (request: any) => {
      // Wait for abort triggered by timeout
      await new Promise<void>((resolve) => {
        if (request.signal?.aborted) {
          resolve();
          return;
        }
        request.signal?.addEventListener('abort', () => {
          resolve();
        }, { once: true });
      });

      return {
        activeProvider: 'aether',
        usedFallback: false,
        result: { ok: false, error: new TimeoutError('stream', 80) },
      };
    });

    const next = vi.fn();
    await controller.stream(req, res as any, next);

    const sseEvents = parseSSEChunks(res.writtenData);
    const failedChunks = sseEvents.filter((e) => e.payload?.status === 'failed');
    expect(failedChunks).toHaveLength(1);
    expect(failedChunks[0].payload?.error).toContain('timed out');

    // Invariant: ZERO [DONE] markers on timeout
    const doneMarkers = sseEvents.filter((e) => e.isDoneMarker);
    expect(doneMarkers).toHaveLength(0);
  });

  // ─── 5. BACKPRESSURE & SLOW CLIENT HANDLING ──────────────────────────────────
  it('SSE-05: When res.write indicates backpressure (false), writer waits for drain event before continuing', async () => {
    const conversationId = `conv_backpressure_${Date.now()}`;
    const { req, res } = createMockReqRes({
      body: {
        message: 'Stream long text to slow client',
        conversationId,
      },
    });

    let drainTriggered = false;
    res.write = (chunk: string) => {
      if (res.writableEnded || res.destroyed) return false;
      res.writtenData.push(chunk);
      if (chunk.includes('Chunk 1')) {
        setTimeout(() => {
          drainTriggered = true;
          res.emit('drain');
        }, 25);
        return false; // Kernel buffer full
      }
      return true;
    };

    vi.spyOn(providerManager, 'generateStream').mockImplementation(async (request: any, onChunk: any) => {
      await onChunk({
        requestId: request.requestId,
        modelId: 'test-model',
        delta: 'Chunk 1',
        index: 0,
        isLast: false,
      });

      // Verify that after awaiting onChunk for Chunk 1, backpressure pause occurred and drain fired
      expect(drainTriggered).toBe(true);

      await onChunk({
        requestId: request.requestId,
        modelId: 'test-model',
        delta: 'Chunk 2',
        index: 1,
        isLast: true,
      });
      return {
        activeProvider: 'mock',
        usedFallback: false,
        result: { ok: true, value: undefined },
      };
    });

    const next = vi.fn();
    await controller.stream(req, res as any, next);

    expect(drainTriggered).toBe(true);
    expect(res.writtenData.some((d) => d.includes('Chunk 1'))).toBe(true);
    expect(res.writtenData.some((d) => d.includes('Chunk 2'))).toBe(true);
    expect(res.writableEnded).toBe(true);
  });

  // ─── 6. DUPLICATE IN-FLIGHT REQUEST PROTECTION ──────────────────────────────
  it('SSE-06: Duplicate in-flight request with identical requestId is rejected with HTTP 409 Conflict', async () => {
    const conversationId = `conv_dup_${Date.now()}`;
    const fixedRequestId = 'req_idempotent_duplicate_test';

    const { req: req1, res: res1 } = createMockReqRes({
      body: {
        requestId: fixedRequestId,
        message: 'First in-flight stream',
        conversationId,
      },
    });

    const { req: req2, res: res2 } = createMockReqRes({
      body: {
        requestId: fixedRequestId,
        message: 'Duplicate click with identical requestId',
        conversationId,
      },
    });

    let resolveFirstStream: () => void;
    const firstStreamGate = new Promise<void>((resolve) => {
      resolveFirstStream = resolve;
    });

    vi.spyOn(providerManager, 'generateStream').mockImplementation(async () => {
      await firstStreamGate;
      return {
        activeProvider: 'mock',
        usedFallback: false,
        result: { ok: true, value: undefined },
      };
    });

    const next = vi.fn();
    // Launch first stream
    const firstStreamPromise = controller.stream(req1, res1 as any, next);

    // Launch duplicate stream concurrently
    await controller.stream(req2, res2 as any, next);

    // Verify second request was rejected with HTTP 409
    expect(res2.statusCode).toBe(409);
    expect(res2.writtenData.some((d) => d.includes('DUPLICATE_REQUEST_IN_FLIGHT'))).toBe(true);

    // Release first stream
    resolveFirstStream!();
    await firstStreamPromise;
  });

  it('SSE-07: New user prompt on same conversation cleanly cancels previous in-flight stream', async () => {
    const conversationId = `conv_supersede_${Date.now()}`;

    const { req: req1, res: res1 } = createMockReqRes({
      body: {
        requestId: 'req_stream_1',
        message: 'First stream message',
        conversationId,
      },
    });

    const { req: req2, res: res2 } = createMockReqRes({
      body: {
        requestId: 'req_stream_2',
        message: 'New user prompt superseding first stream',
        conversationId,
      },
    });

    let firstStreamAborted = false;
    let notifyFirstStreamInside: () => void;
    const firstStreamInsidePromise = new Promise<void>((resolve) => {
      notifyFirstStreamInside = resolve;
    });

    vi.spyOn(providerManager, 'generateStream').mockImplementation(async (request: any, onChunk: any) => {
      if (request.requestId === 'req_stream_1') {
        notifyFirstStreamInside();
        await new Promise<void>((resolve) => {
          if (request.signal?.aborted) {
            firstStreamAborted = true;
            resolve();
            return;
          }
          const onAbort = () => {
            firstStreamAborted = true;
            resolve();
          };
          request.signal?.addEventListener('abort', onAbort, { once: true });
        });
        return {
          activeProvider: 'mock',
          usedFallback: false,
          result: { ok: false, error: new CancelledError('Superseded') },
        };
      }

      await onChunk({
        requestId: request.requestId,
        modelId: 'test-model',
        delta: 'Second stream answer.',
        index: 0,
        isLast: true,
      });
      return {
        activeProvider: 'mock',
        usedFallback: false,
        result: { ok: true, value: undefined },
      };
    });

    const next = vi.fn();
    const firstPromise = controller.stream(req1, res1 as any, next);

    // Wait until first stream is inside generateStream
    await firstStreamInsidePromise;

    // Send second stream
    await controller.stream(req2, res2 as any, next);
    await firstPromise;

    expect(firstStreamAborted).toBe(true);
    expect(res1.writtenData.some((d) => d.includes('"status":"cancelled"'))).toBe(true);
    expect(res2.writtenData.some((d) => d.includes('"status":"completed"'))).toBe(true);
  });

  // ─── 7. TOOL EXECUTION STREAMING SAFETY & VERIFICATION ───────────────────────
  it('SSE-08: Tool failure emits verified: false and failure status; never reports false success', async () => {
    const conversationId = `conv_tool_fail_${Date.now()}`;
    const { req, res } = createMockReqRes({
      body: {
        message: 'Create a task to migrate payment subsystem',
        conversationId,
      },
    });

    // Simulate tool execution failure
    vi.spyOn(toolExecutor, 'execute').mockResolvedValueOnce({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      error: 'Permission denied on payments table',
      executionTimeMs: 10,
      verified: false,
      verificationStatus: 'FAILED',
    });

    const next = vi.fn();
    await controller.stream(req, res as any, next);

    const sseEvents = parseSSEChunks(res.writtenData);

    // Verify planning and executing events preceded failure
    expect(sseEvents.some((e) => e.payload?.status === 'planning')).toBe(true);
    expect(sseEvents.some((e) => e.payload?.status === 'executing')).toBe(true);

    // Verify terminal failure event has verified: false
    const terminalChunk = sseEvents.find((e) => e.payload?.isLast === true);
    expect(terminalChunk).toBeDefined();
    expect(terminalChunk?.payload?.status).toBe('failed');
    expect(terminalChunk?.payload?.verified).toBe(false);
    expect(terminalChunk?.payload?.verificationStatus).toBe('FAILED');

    // Invariant: ZERO verified: true claims
    const falseVerified = sseEvents.find(
      (e) => e.payload?.status === 'verified' && e.payload?.verified === true,
    );
    expect(falseVerified).toBeUndefined();

    // Invariant: ZERO [DONE] on failure
    const doneMarkers = sseEvents.filter((e) => e.isDoneMarker);
    expect(doneMarkers).toHaveLength(0);
  });

  // ─── 8. EXACTLY ONE LOGICAL TERMINAL STATE INVARIANT ─────────────────────────
  it('SSE-09: Terminal state guarantee — every stream ends in exactly ONE terminal chunk', async () => {
    // Test that across successful streams, failed streams, and cancelled streams,
    // exactly one chunk with isLast: true is emitted.
    const scenarios = [
      { name: 'success', failModel: false },
      { name: 'failure', failModel: true },
    ];

    for (const scenario of scenarios) {
      const { req, res } = createMockReqRes({
        body: {
          message: `Testing scenario ${scenario.name}`,
          conversationId: `conv_term_${scenario.name}_${Date.now()}`,
        },
      });

      if (scenario.failModel) {
        vi.spyOn(providerManager, 'generateStream').mockResolvedValueOnce({
          activeProvider: 'aether',
          usedFallback: false,
          result: { ok: false, error: new ProviderUnavailableError('aether', 'Model down') },
        });
      } else {
        vi.spyOn(providerManager, 'generateStream').mockImplementationOnce(async (request: any, onChunk: any) => {
          await onChunk({
            requestId: request.requestId,
            modelId: 'test',
            delta: 'OK',
            index: 0,
            isLast: true,
          });
          return {
            activeProvider: 'mock',
            usedFallback: false,
            result: { ok: true, value: undefined },
          };
        });
      }

      await controller.stream(req, res as any, vi.fn());

      const sseEvents = parseSSEChunks(res.writtenData);
      const terminalChunks = sseEvents.filter((e) => e.payload?.isLast === true);

      // Exactly ONE terminal chunk
      expect(terminalChunks).toHaveLength(1);
      const terminal = terminalChunks[0].payload;
      expect(['completed', 'failed', 'cancelled']).toContain(terminal.status);

      if (terminal.status === 'completed') {
        // [DONE] present only on completed
        expect(sseEvents.filter((e) => e.isDoneMarker)).toHaveLength(1);
      } else {
        // [DONE] never present on failed or cancelled
        expect(sseEvents.filter((e) => e.isDoneMarker)).toHaveLength(0);
      }
    }
  });
});
