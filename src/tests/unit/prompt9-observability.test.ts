/**
 * AETHER AI — Prompt 9 Observability & Distributed Tracing Test Suite
 *
 * Verification Areas:
 * 1. Distributed Tracing & Correlation Propagation (Correlation IDs, Span Hierarchies, Monotonic Clocks)
 * 2. Tenant Isolation in Telemetry & Traces (Cross-tenant lookup rejection, Admin override)
 * 3. Bounded Trace Buffers & Eviction (Max span limits, FIFO eviction)
 * 4. Recursive Secret & Sensitive Data Sanitization (Circular references, Tokens, Bearer headers, Deep structures)
 * 5. Strict Chain-of-Thought Stripping (CoT keys erased from logs and events)
 * 6. Canonical Error Taxonomy & Stack Trace Suppression (17 error categories, safe messages)
 * 7. Metrics Layer & Cardinality Protection (Stripping high-cardinality keys, Prometheus exposition)
 * 8. Multi-Tier Health Checks (Bounded timeouts, Subsystems, Statuses, No credentials leaked)
 * 9. Append-Only Immutable Action Audit Log (Append-only storage, Tamper-resistance)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataSanitizer } from '../../modules/ai/observability/sanitizer.js';
import { tracer } from '../../modules/ai/observability/tracing.js';
import { metrics } from '../../modules/ai/observability/metrics.js';
import { healthChecker } from '../../modules/ai/observability/health.js';
import { classifyError, StandardError } from '../../modules/ai/observability/error-taxonomy.js';
import { actionAuditLogger } from '../../modules/ai/audit/action-audit-logger.js';
import { logger } from '../../modules/ai/observability/logger.js';

describe('Prompt 9: Production Observability & Distributed Tracing', () => {
  beforeEach(() => {
    tracer.clear();
    metrics.reset();
  });

  // ============================================================================
  // 1. Recursive Secret & Sensitive Data Sanitization
  // ============================================================================
  describe('DataSanitizer: Recursive Sensitive Data Redaction', () => {
    it('redacts sensitive keys in deeply nested objects', () => {
      const input = {
        user: {
          name: 'Alice',
          credentials: {
            password: 'SuperSecretPassword123!',
            apiKey: 'sk-proj-9876543210abcdef',
            jwtSecret: 'super-long-jwt-secret-string-here',
          },
        },
        meta: {
          clientSecret: 'secret_12345',
        },
      };

      const sanitized = DataSanitizer.sanitize(input);

      expect(sanitized.user.name).toBe('Alice');
      expect(sanitized.user.credentials.password).toBe('[REDACTED]');
      expect(sanitized.user.credentials.apiKey).toBe('[REDACTED]');
      expect(sanitized.user.credentials.jwtSecret).toBe('[REDACTED]');
      expect(sanitized.meta.clientSecret).toBe('[REDACTED]');
    });

    it('redacts inline credentials in strings (Bearer tokens, DB URIs, secret keys)', () => {
      const input = {
        authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcnhfCOoEloFlqKDeVmmAIFqAz3aEBWJ6PfOfRNk',
        connectionString: 'postgres://admin:super_secret_pw@db.production.aether.internal:5432/aether_db',
        openaiKey: 'sk-1234567890abcdefghijklmnopqrstuv',
      };

      const sanitized = DataSanitizer.sanitize(input);

      expect(sanitized.authHeader).toBe('Bearer [REDACTED]');
      expect(sanitized.connectionString).toBe('[REDACTED_URI]');
      expect(sanitized.openaiKey).toBe('[REDACTED]');
    });

    it('gracefully handles circular references without throwing or hanging', () => {
      const objA: any = { name: 'A' };
      const objB: any = { name: 'B' };
      objA.neighbor = objB;
      objB.neighbor = objA;

      let result: any;
      expect(() => {
        result = DataSanitizer.sanitize(objA);
      }).not.toThrow();

      expect(result.name).toBe('A');
      expect(result.neighbor.name).toBe('B');
      expect(result.neighbor.neighbor).toBe('[CIRCULAR]');
    });

    it('sanitizes arrays containing sensitive data and nested arrays', () => {
      const list = [
        { id: 1, token: 'secret-token-xyz' },
        ['nested-item', { apiKey: 'secret-api-key' }],
      ];

      const sanitized = DataSanitizer.sanitize(list);

      expect(sanitized[0].id).toBe(1);
      expect(sanitized[0].token).toBe('[REDACTED]');
      expect(sanitized[1][0]).toBe('nested-item');
      expect(sanitized[1][1].apiKey).toBe('[REDACTED]');
    });
  });

  // ============================================================================
  // 2. Strict Chain-of-Thought (CoT) Stripping
  // ============================================================================
  describe('DataSanitizer: Zero Chain-of-Thought Leakage Invariant', () => {
    it('completely strips private CoT keys from objects', () => {
      const executionPayload = {
        userId: 'user_123',
        input: 'Analyze user portfolio',
        chain_of_thought: 'The user wants portfolio analysis. Let me secretly inspect hidden balances.',
        thought_process: 'Step 1: Check memory. Step 2: Query DB.',
        inner_deliberation: 'Should I disclose fee structure? No.',
        internal_reasoning: 'Plan looks sound.',
        reasoning_trace: 'Evaluation passed.',
        cot: 'Short CoT snippet',
        publicSummary: 'Analyzing portfolio performance.',
      };

      const sanitized = DataSanitizer.sanitize(executionPayload);

      expect(sanitized.userId).toBe('user_123');
      expect(sanitized.input).toBe('Analyze user portfolio');
      expect(sanitized.publicSummary).toBe('Analyzing portfolio performance.');
      expect(sanitized.chain_of_thought).toBeUndefined();
      expect(sanitized.thought_process).toBeUndefined();
      expect(sanitized.inner_deliberation).toBeUndefined();
      expect(sanitized.internal_reasoning).toBeUndefined();
      expect(sanitized.reasoning_trace).toBeUndefined();
      expect(sanitized.cot).toBeUndefined();
    });

    it('strips CoT keys when nested inside step outputs and tool execution payloads', () => {
      const toolEvent = {
        toolName: 'financial_calculator',
        result: {
          balance: 10000,
          cot: 'Hidden computation details',
          chainOfThought: 'Secret internal reasoning',
        },
      };

      const sanitized = DataSanitizer.sanitize(toolEvent);

      expect(sanitized.toolName).toBe('financial_calculator');
      expect(sanitized.result.balance).toBe(10000);
      expect(sanitized.result.cot).toBeUndefined();
      expect(sanitized.result.chainOfThought).toBeUndefined();
    });
  });

  // ============================================================================
  // 3. Distributed Tracing & Parent-Child Hierarchy
  // ============================================================================
  describe('Tracer: Distributed Tracing & Span Lifecycle', () => {
    it('creates root spans and nested child spans with monotonic timestamps', async () => {
      const correlationId = 'corr_test_123';
      const rootSpan = tracer.startSpan('http.request', {
        correlationId,
        component: 'HttpGateway',
        userId: 'user_alice',
        attributes: { path: '/api/v1/chat' },
      });

      expect(rootSpan.traceId).toBe(correlationId);
      expect(rootSpan.spanId).toBeDefined();
      expect(rootSpan.parentSpanId).toBeUndefined();
      expect(rootSpan.status).toBe('ok');

      // Small delay to ensure non-zero duration
      await new Promise((r) => setTimeout(r, 10));

      const childSpan = tracer.startSpan('plan.generate', {
        correlationId,
        parentSpanId: rootSpan.spanId,
        component: 'PlanningEngine',
        userId: 'user_alice',
      });

      expect(childSpan.traceId).toBe(correlationId);
      expect(childSpan.parentSpanId).toBe(rootSpan.spanId);

      tracer.endSpan(childSpan.spanId);
      tracer.endSpan(rootSpan.spanId);

      const traceTree = tracer.getTrace(correlationId, 'user_alice');
      expect(traceTree).not.toBeNull();
      expect(traceTree!.traceId).toBe(correlationId);
      expect(traceTree!.spans.length).toBe(2);

      const rootInTree = traceTree!.spans.find((s) => s.spanId === rootSpan.spanId);
      const childInTree = traceTree!.spans.find((s) => s.spanId === childSpan.spanId);

      expect(rootInTree).toBeDefined();
      expect(childInTree).toBeDefined();
      expect(rootInTree!.durationMs).toBeGreaterThanOrEqual(0);
      expect(childInTree!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('enforces tenant isolation on trace retrieval', () => {
      const correlationId = 'corr_tenant_test';
      const span = tracer.startSpan('memory.search', {
        correlationId,
        component: 'MemoryEngine',
        userId: 'user_bob',
      });
      tracer.endSpan(span.spanId);

      // User Bob can retrieve his trace
      const bobTrace = tracer.getTrace(correlationId, 'user_bob');
      expect(bobTrace).not.toBeNull();

      // User Mallory cannot retrieve Bob's trace (cross-tenant rejection)
      const malloryTrace = tracer.getTrace(correlationId, 'user_mallory');
      expect(malloryTrace).toBeNull();
    });

    it('enforces bounded in-memory buffer with FIFO eviction', () => {
      // Clear and fill tracer beyond capacity (max 1000)
      tracer.clear();

      for (let i = 0; i < 1050; i++) {
        const s = tracer.startSpan(`span_${i}`, {
          correlationId: `corr_${i}`,
          component: 'StressTest',
        });
        tracer.endSpan(s.spanId);
      }

      // Buffer size must never exceed 1000
      expect(tracer.getSpanCount()).toBeLessThanOrEqual(1000);

      // Earliest spans should have been evicted (FIFO)
      const earliest = tracer.getTrace('corr_0');
      expect(earliest).toBeNull();

      // Latest spans should be retained
      const latest = tracer.getTrace('corr_1049');
      expect(latest).not.toBeNull();
    });
  });

  // ============================================================================
  // 4. Canonical Error Taxonomy
  // ============================================================================
  describe('Canonical Error Taxonomy & Safe Error Classification', () => {
    it('classifies custom errors with status codes correctly', () => {
      const err400 = new StandardError('VALIDATION_ERROR', 'Field required', 400);
      const classified400 = classifyError(err400);
      expect(classified400.code).toBe('VALIDATION_ERROR');
      expect(classified400.httpStatus).toBe(400);
      expect(classified400.retryable).toBe(false);

      const err401 = new StandardError('AUTHENTICATION_ERROR', 'Token invalid', 401);
      const classified401 = classifyError(err401);
      expect(classified401.code).toBe('AUTHENTICATION_ERROR');
      expect(classified401.httpStatus).toBe(401);

      const err403 = new StandardError('TENANT_ISOLATION_ERROR', 'Cross-tenant forbidden', 403);
      const classified403 = classifyError(err403);
      expect(classified403.code).toBe('TENANT_ISOLATION_ERROR');
      expect(classified403.httpStatus).toBe(403);

      const err404 = new StandardError('NOT_FOUND', 'Plan not found', 404);
      const classified404 = classifyError(err404);
      expect(classified404.code).toBe('NOT_FOUND');
      expect(classified404.httpStatus).toBe(404);

      const err429 = new StandardError('RATE_LIMITED', 'Too many requests', 429);
      const classified429 = classifyError(err429);
      expect(classified429.code).toBe('RATE_LIMITED');
      expect(classified429.httpStatus).toBe(429);
      expect(classified429.retryable).toBe(true);

      const err503 = new StandardError('MODEL_UNAVAILABLE', 'Local inference server down', 503);
      const classified503 = classifyError(err503);
      expect(classified503.code).toBe('MODEL_UNAVAILABLE');
      expect(classified503.httpStatus).toBe(503);
      expect(classified503.retryable).toBe(true);
    });

    it('classifies generic JavaScript Errors without leaking stack traces', () => {
      const genericError = new Error('Unexpected undefined property access at foo.js:123:45');
      const classified = classifyError(genericError);

      expect(classified.code).toBe('INTERNAL_ERROR');
      expect(classified.httpStatus).toBe(500);
      // Safe message should be returned without stack trace internals
      expect(classified.message).toMatch(/internal (server )?error/i);
    });

    it('classifies network and timeout errors as retryable TRANSIENT_FAILURE or TIMEOUT', () => {
      const connReset = new Error('read ECONNRESET');
      (connReset as any).code = 'ECONNRESET';
      const classifiedConn = classifyError(connReset);
      expect(classifiedConn.code).toBe('TRANSIENT_FAILURE');
      expect(classifiedConn.retryable).toBe(true);

      const timeoutErr = new Error('Request timed out after 5000ms');
      (timeoutErr as any).code = 'ETIMEDOUT';
      const classifiedTimeout = classifyError(timeoutErr);
      expect(classifiedTimeout.code).toBe('TIMEOUT');
      expect(classifiedTimeout.retryable).toBe(true);
    });
  });

  // ============================================================================
  // 5. Metrics Layer & Cardinality Protection
  // ============================================================================
  describe('Metrics: Metrics Registry & High-Cardinality Protection', () => {
    it('records API, Model, RAG, Memory, Tool, and Agent metrics', () => {
      metrics.recordApiRequest('GET', '/api/v1/health', 200, 15);
      metrics.recordModelRequest('aether', 'aether-authoritative');
      metrics.recordModelLatency(120, 'aether', 'aether-authoritative');
      metrics.recordModelTokens('aether', 'aether-authoritative', 45, 'prompt');
      metrics.recordModelTokens('aether', 'aether-authoritative', 30, 'completion');
      metrics.recordRAGRequest('workspace_docs');
      metrics.recordRAGLatency(25, 'workspace_docs');
      metrics.recordMemoryOperation('search', 'success');
      metrics.recordToolRequest('calendar_create');
      metrics.recordAgentExecution('COMPLETED');

      const summary = metrics.getSummary();

      expect(summary.api.requestsTotal).toBeGreaterThan(0);
      expect(summary.model.requestsTotal).toBeGreaterThan(0);
      expect(summary.rag.requestsTotal).toBeGreaterThan(0);
      expect(summary.memory.operationsTotal).toBeGreaterThan(0);
      expect(summary.tools.requestsTotal).toBeGreaterThan(0);
      expect(summary.agent.executionsTotal).toBeGreaterThan(0);
    });

    it('strips high-cardinality keys (userId, executionId, requestId, etc.) from metric labels', () => {
      metrics.recordCustomMetric('custom_event_total', 1, {
        userId: 'user_very_specific_123',
        executionId: 'exec_abcdef_999',
        requestId: 'req_xyz_111',
        conversationId: 'conv_private_222',
        service: 'AETHER_BAC',
        status: 'success',
      });

      const summary = metrics.getSummary();
      const customMetrics = summary.custom;
      expect(customMetrics['custom_event_total']).toBeDefined();

      // Check Prometheus export format
      const prometheusOutput = metrics.toPrometheus();
      expect(prometheusOutput).toContain('custom_event_total');
      expect(prometheusOutput).toContain('service="AETHER_BAC"');
      expect(prometheusOutput).toContain('status="success"');

      // Cardinality protection: raw IDs must NOT appear as Prometheus label keys
      expect(prometheusOutput).not.toContain('userId="user_very_specific_123"');
      expect(prometheusOutput).not.toContain('executionId="exec_abcdef_999"');
      expect(prometheusOutput).not.toContain('requestId="req_xyz_111"');
      expect(prometheusOutput).not.toContain('conversationId="conv_private_222"');
    });

    it('generates valid Prometheus exposition text format', () => {
      metrics.recordApiRequest('POST', '/api/v1/chat', 200, 55);
      const text = metrics.toPrometheus();

      expect(text).toContain('# HELP');
      expect(text).toContain('# TYPE');
      expect(text).toContain('aether_http_requests_total');
      expect(text).toContain('method="POST"');
      expect(text).toContain('status="200"');
    });
  });

  // ============================================================================
  // 6. Multi-Tier Health Checks
  // ============================================================================
  describe('HealthChecker: Multi-Tier Bounded Subsystem Checks', () => {
    it('reports health report with all expected subsystems', async () => {
      const report = await healthChecker.getReport();

      expect(report.status).toMatch(/HEALTHY|DEGRADED|UNAVAILABLE/);
      expect(report.timestamp).toBeDefined();
      expect(report.subsystems).toBeDefined();
      expect(report.subsystems.database).toBeDefined();
      expect(report.subsystems.redis).toBeDefined();
      expect(report.subsystems.model).toBeDefined();
      expect(report.subsystems.rag).toBeDefined();
      expect(report.subsystems.memory).toBeDefined();
    });

    it('never leaks database passwords or URLs in health output', async () => {
      const report = await healthChecker.getReport();
      const reportStr = JSON.stringify(report);

      expect(reportStr).not.toContain('password');
      expect(reportStr).not.toContain('postgres://');
      expect(reportStr).not.toContain('redis://');
      expect(reportStr).not.toContain('secret');
    });

    it('bounds individual subsystem health check execution with timeout', async () => {
      const start = Date.now();
      const report = await healthChecker.getReport();
      const duration = Date.now() - start;

      // Health check must complete within reasonable time, never hanging indefinitely
      expect(duration).toBeLessThan(3000);
      expect(report.status).toBeDefined();
    });
  });

  // ============================================================================
  // 7. Append-Only Immutable Action Audit Log
  // ============================================================================
  describe('ActionAuditLogger: Append-Only Immutable Audit Trail', () => {
    it('appends and retrieves audit records with correlationId and sanitized payloads', async () => {
      const correlationId = 'corr_audit_test_99';
      const record = await actionAuditLogger.log({
        toolName: 'file_writer',
        actionType: 'tool.execution',
        userId: 'user_audit_1',
        workspaceId: 'ws_audit_1',
        correlationId,
        planId: 'plan_audit_1',
        stepId: 'step_audit_1',
        input: {
          path: '/home/user/document.txt',
          apiKey: 'sk-secret-key-to-redact',
        },
        result: {
          success: true,
          bytesWritten: 120,
        },
        riskLevel: 'LOW_RISK',
        status: 'SUCCESS',
        verified: true,
        executionTimeMs: 45,
      });

      expect(record.id).toBeDefined();
      expect(record.correlationId).toBe(correlationId);
      expect(record.timestamp).toBeDefined();

      // Audit logs query for tenant
      const logs = await actionAuditLogger.getLogs({
        userId: 'user_audit_1',
        correlationId,
      });

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const matched = logs.find((l) => l.id === record.id);
      expect(matched).toBeDefined();
      expect((matched!.input as any).path).toBe('/home/user/document.txt');
      // Secret key must be sanitized in audit log record
      expect((matched!.input as any).apiKey).toBe('[REDACTED]');
    });

    it('enforces tenant isolation on audit log queries', async () => {
      await actionAuditLogger.log({
        toolName: 'system_manager',
        actionType: 'system.update',
        userId: 'user_alpha',
        workspaceId: 'ws_alpha',
        input: { sensitiveData: 'alpha_value' },
        riskLevel: 'LOW_RISK',
        status: 'SUCCESS',
        verified: true,
        executionTimeMs: 10,
      });

      // User Beta cannot view User Alpha's audit logs
      const betaLogs = await actionAuditLogger.getLogs({
        userId: 'user_beta',
      });

      const alphaRecords = betaLogs.filter((l) => l.userId === 'user_alpha');
      expect(alphaRecords.length).toBe(0);
    });
  });
});
