/**
 * AETHER AI — Prompt 9 Full System Distributed Trace Test Suite
 *
 * Verification Areas:
 * 1. End-to-End Hierarchical Distributed Trace Construction
 *    Root HTTP Request -> Planning -> Execution Loop -> Step -> Tool -> Memory/RAG -> Model Inference
 * 2. Monotonic Timing & Parent-Child Span Envelopes
 * 3. Trace Reconstruction DAG via correlationId and traceId
 * 4. Tenant Isolation across Full Trace Trees
 * 5. Diagnostic Controller Trace Export & Validation
 * 6. Zero Sensitive Data & Zero CoT Invariant across Entire Trace Tree
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { tracer } from '../../modules/ai/observability/tracing.js';
import { metrics } from '../../modules/ai/observability/metrics.js';
import { DataSanitizer } from '../../modules/ai/observability/sanitizer.js';
import { diagnosticController } from '../../modules/ai/observability/diagnostic.controller.js';
import { executionRepository } from '../../modules/ai/execution/execution-repository.js';
import type { Request, Response } from 'express';

describe('Prompt 9: Full System End-to-End Distributed Trace', () => {
  const TEST_CORRELATION_ID = 'corr_e2e_full_trace_12345';
  const TEST_USER_ID = 'user_authoritative_alice';
  const TEST_WORKSPACE_ID = 'ws_authoritative_aether';

  beforeEach(() => {
    tracer.clear();
    metrics.reset();
  });

  // ============================================================================
  // 1. End-to-End Full System Hierarchical Trace Construction
  // ============================================================================
  it('constructs a complete 7-tier hierarchical trace DAG across all AETHER subsystems', async () => {
    // 1. Root HTTP span
    const rootSpan = tracer.startSpan('http.post.chat', {
      correlationId: TEST_CORRELATION_ID,
      component: 'HttpGateway',
      userId: TEST_USER_ID,
      workspaceId: TEST_WORKSPACE_ID,
      attributes: { path: '/api/v1/chat', method: 'POST' },
    });

    // 2. Planning Engine span (child of root)
    const planSpan = tracer.startSpan('planning.generate_plan', {
      correlationId: TEST_CORRELATION_ID,
      parentSpanId: rootSpan.spanId,
      component: 'PlanningEngine',
      userId: TEST_USER_ID,
      workspaceId: TEST_WORKSPACE_ID,
      attributes: { planType: 'multi_step' },
    });

    // 3. Execution Engine span (child of plan)
    const execSpan = tracer.startSpan('execution.loop', {
      correlationId: TEST_CORRELATION_ID,
      parentSpanId: planSpan.spanId,
      component: 'ExecutionEngine',
      userId: TEST_USER_ID,
      workspaceId: TEST_WORKSPACE_ID,
      attributes: { totalSteps: 2 },
    });

    // 4. Step Execution span (child of execution loop)
    const stepSpan = tracer.startSpan('execution.step.1', {
      correlationId: TEST_CORRELATION_ID,
      parentSpanId: execSpan.spanId,
      component: 'ExecutionEngine',
      userId: TEST_USER_ID,
      attributes: { stepId: 'step_1', toolName: 'file_reader' },
    });

    // 5. Tool Executor span (child of step)
    const toolSpan = tracer.startSpan('tool.execute.file_reader', {
      correlationId: TEST_CORRELATION_ID,
      parentSpanId: stepSpan.spanId,
      component: 'ToolExecutor',
      userId: TEST_USER_ID,
      attributes: { tool: 'file_reader', version: '1.0.0' },
    });

    // 6. Memory & RAG Retrieval spans (children of tool)
    const memorySpan = tracer.startSpan('memory.search', {
      correlationId: TEST_CORRELATION_ID,
      parentSpanId: toolSpan.spanId,
      component: 'MemoryEngine',
      userId: TEST_USER_ID,
      attributes: { scope: 'WORKSPACE', topK: 5 },
    });

    const ragSpan = tracer.startSpan('rag.query', {
      correlationId: TEST_CORRELATION_ID,
      parentSpanId: toolSpan.spanId,
      component: 'RAGEngine',
      userId: TEST_USER_ID,
      attributes: { index: 'docs_index' },
    });

    // 7. Model Inference span (child of tool)
    const modelSpan = tracer.startSpan('model.inference', {
      correlationId: TEST_CORRELATION_ID,
      parentSpanId: toolSpan.spanId,
      component: 'AetherProvider',
      userId: TEST_USER_ID,
      attributes: { model: 'aether-v1-authoritative' },
    });

    // Small delay to ensure positive monotonic duration
    await new Promise((r) => setTimeout(r, 10));

    // Close spans from leaves upward
    tracer.endSpan(modelSpan.spanId, 'ok');
    tracer.endSpan(ragSpan.spanId, 'ok');
    tracer.endSpan(memorySpan.spanId, 'ok');
    tracer.endSpan(toolSpan.spanId, 'ok');
    tracer.endSpan(stepSpan.spanId, 'ok');
    tracer.endSpan(execSpan.spanId, 'ok');
    tracer.endSpan(planSpan.spanId, 'ok');
    tracer.endSpan(rootSpan.spanId, 'ok');

    // Retrieve and verify the full trace tree
    const traceTree = tracer.getTrace(TEST_CORRELATION_ID, TEST_USER_ID);

    expect(traceTree).not.toBeNull();
    expect(traceTree!.traceId).toBe(TEST_CORRELATION_ID);
    expect(traceTree!.correlationId).toBe(TEST_CORRELATION_ID);
    expect(traceTree!.status).toBe('ok');
    expect(traceTree!.spans.length).toBe(8);

    // Verify root span
    expect(traceTree!.rootSpan.spanId).toBe(rootSpan.spanId);
    expect(traceTree!.rootSpan.parentSpanId).toBeUndefined();

    // Verify parent-child DAG integrity
    const planInTree = traceTree!.spans.find((s) => s.spanId === planSpan.spanId);
    const execInTree = traceTree!.spans.find((s) => s.spanId === execSpan.spanId);
    const stepInTree = traceTree!.spans.find((s) => s.spanId === stepSpan.spanId);
    const toolInTree = traceTree!.spans.find((s) => s.spanId === toolSpan.spanId);
    const memInTree = traceTree!.spans.find((s) => s.spanId === memorySpan.spanId);
    const ragInTree = traceTree!.spans.find((s) => s.spanId === ragSpan.spanId);
    const modelInTree = traceTree!.spans.find((s) => s.spanId === modelSpan.spanId);

    expect(planInTree?.parentSpanId).toBe(rootSpan.spanId);
    expect(execInTree?.parentSpanId).toBe(planSpan.spanId);
    expect(stepInTree?.parentSpanId).toBe(execSpan.spanId);
    expect(toolInTree?.parentSpanId).toBe(stepSpan.spanId);
    expect(memInTree?.parentSpanId).toBe(toolSpan.spanId);
    expect(ragInTree?.parentSpanId).toBe(toolSpan.spanId);
    expect(modelInTree?.parentSpanId).toBe(toolSpan.spanId);

    // Verify monotonic durations
    for (const span of traceTree!.spans) {
      expect(span.durationMs).toBeDefined();
      expect(span.durationMs!).toBeGreaterThanOrEqual(0);
    }
  });

  // ============================================================================
  // 2. Tenant Isolation Invariant on Trace Tree
  // ============================================================================
  it('strictly isolates full trace trees by tenant userId', () => {
    const correlationId = 'corr_tenant_iso_e2e';
    const span = tracer.startSpan('tenant.private.operation', {
      correlationId,
      component: 'SecretModule',
      userId: 'user_alpha_isolated',
    });
    tracer.endSpan(span.spanId);

    // Owner can access
    const ownerView = tracer.getTrace(correlationId, 'user_alpha_isolated');
    expect(ownerView).not.toBeNull();
    expect(ownerView?.spans.length).toBe(1);

    // Non-owner tenant cannot access
    const impostorView = tracer.getTrace(correlationId, 'user_beta_intruder');
    expect(impostorView).toBeNull();
  });

  // ============================================================================
  // 3. Zero Secret & Zero CoT Leakage Invariant across Full Trace Tree
  // ============================================================================
  it('ensures no node in the trace tree contains credentials, tokens, or Chain-of-Thought keys', () => {
    const correlationId = 'corr_sanitize_e2e';
    const dirtyAttributes = {
      apiKey: 'sk-proj-super-secret-key-1234567890',
      password: 'ProductionPassword!2026',
      bearerHeader: 'Bearer eyJhbGciOiJIUzI1NiJ9.test',
      databaseUri: 'postgres://root:password@localhost:5432/aether',
      chain_of_thought: 'Confidential reasoning step',
      thought_process: 'Internal deliberation hidden from user',
      safeParam: 'public_value',
    };

    // Sanitize before attaching to span
    const cleanAttributes = DataSanitizer.sanitize(dirtyAttributes);

    const span = tracer.startSpan('sanitized.operation', {
      correlationId,
      component: 'SanitizedEngine',
      userId: TEST_USER_ID,
      attributes: cleanAttributes,
    });
    tracer.endSpan(span.spanId);

    const trace = tracer.getTrace(correlationId, TEST_USER_ID);
    expect(trace).not.toBeNull();

    const serializedTrace = JSON.stringify(trace);
    expect(serializedTrace).not.toContain('super-secret-key');
    expect(serializedTrace).not.toContain('ProductionPassword');
    expect(serializedTrace).not.toContain('postgres://root:password');
    expect(serializedTrace).not.toContain('Confidential reasoning step');
    expect(serializedTrace).not.toContain('chain_of_thought');
    expect(serializedTrace).not.toContain('thought_process');
    expect(serializedTrace).toContain('public_value');
  });

  // ============================================================================
  // 4. Diagnostic Controller Trace Retrieval & Cross-Tenant Protection
  // ============================================================================
  describe('DiagnosticController: Trace Retrieval Endpoint', () => {
    it('returns trace tree for authorized user via diagnostic controller', async () => {
      // Create an execution record in repository
      const exec = await executionRepository.createExecution({
        id: 'exec_diag_test_1',
        planId: 'plan_diag_1',
        planVersion: 1,
        planHash: 'hash_123',
        correlationId: 'corr_diag_trace_1',
        userId: 'user_diag_alice',
        status: 'COMPLETED',
        totalSteps: 1,
        completedStepsCount: 1,
        failedStepsCount: 0,
        completedStepIds: ['step_1'],
        failedStepIds: [],
        blockedStepIds: [],
        replanningRequired: false,
        startedAt: new Date(Date.now() - 500).toISOString(),
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Start a trace matching this execution's correlationId
      const span = tracer.startSpan('agent.execution', {
        correlationId: exec.correlationId,
        component: 'ExecutionEngine',
        userId: 'user_diag_alice',
      });
      tracer.endSpan(span.spanId, 'ok');

      let responseCode = 0;
      let responseBody: any = null;

      const mockReq = {
        params: { id: exec.id },
        user: { id: 'user_diag_alice', role: 'user' },
      } as unknown as Request;

      const mockRes = {
        status(code: number) {
          responseCode = code;
          return this;
        },
        json(body: any) {
          responseBody = body;
          return this;
        },
      } as unknown as Response;

      await diagnosticController.getExecutionTrace(mockReq, mockRes);

      expect(responseCode).toBe(200);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data).toBeDefined();
      expect(responseBody.data.traceId).toBe(exec.correlationId);
    });

    it('rejects cross-tenant access with 403 or 404 in diagnostic controller', async () => {
      const exec = await executionRepository.createExecution({
        id: 'exec_diag_tenant_secret',
        planId: 'plan_secret',
        planVersion: 1,
        planHash: 'hash_secret',
        correlationId: 'corr_secret_tenant',
        userId: 'user_secret_owner',
        status: 'COMPLETED',
        totalSteps: 1,
        completedStepsCount: 1,
        failedStepsCount: 0,
        completedStepIds: ['step_1'],
        failedStepIds: [],
        blockedStepIds: [],
        replanningRequired: false,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      let responseCode = 0;
      let responseBody: any = null;

      // Attacker trying to view owner's execution trace
      const mockReq = {
        params: { id: exec.id },
        user: { id: 'user_attacker', role: 'user' },
      } as unknown as Request;

      const mockRes = {
        status(code: number) {
          responseCode = code;
          return this;
        },
        json(body: any) {
          responseBody = body;
          return this;
        },
      } as unknown as Response;

      await diagnosticController.getExecutionTrace(mockReq, mockRes);

      // Must be 404 (not found for tenant) or 403 (tenant isolation error)
      expect([403, 404]).toContain(responseCode);
      expect(responseBody.success).toBe(false);
    });
  });
});
