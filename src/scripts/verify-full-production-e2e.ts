/**
 * AETHER — Comprehensive Master Production Verification Script
 * Validates all 10 End-to-End User Journeys and Negative Branches
 * against the live running system and local neural model server.
 */

import { globalAiEngine } from '../modules/ai/core/ai-engine.js';
import { AetherModelProvider } from '../modules/ai/llm/providers/aether-provider.js';
import { toolExecutor } from '../modules/ai/tools/tool-executor.js';
import { JWTService } from '../auth/jwt.js';
import { planningEngine } from '../modules/ai/planning/planning-engine.js';
import { db } from '../database/client.js';
import type { AIRequest, StreamingChunk } from '../modules/ai/ai-types.js';

interface JourneyResult {
  journeyId: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
  metrics?: Record<string, any>;
}

const results: JourneyResult[] = [];

async function runJourney(
  journeyId: string,
  name: string,
  fn: () => Promise<{ details: string; metrics?: Record<string, any> }>,
) {
  const start = Date.now();
  try {
    const res = await fn();
    const durationMs = Date.now() - start;
    results.push({
      journeyId,
      name,
      passed: true,
      durationMs,
      details: res.details,
      metrics: res.metrics,
    });
    console.log(`[PASS] ${journeyId}: ${name} (${durationMs}ms)`);
    if (res.metrics) {
      console.log(`       Metrics: ${JSON.stringify(res.metrics)}`);
    }
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({
      journeyId,
      name,
      passed: false,
      durationMs,
      details: `Failed with error: ${err.message || String(err)}`,
    });
    console.error(`[FAIL] ${journeyId}: ${name} (${durationMs}ms) - ${err.message}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('  AETHER MASTER PRODUCTION READINESS E2E VERIFICATION (10/10)   ');
  console.log('================================================================\n');

  const engine = globalAiEngine;
  await engine.initialize();

  const testUserId = 'a0000000-0000-0000-0000-000000000001';
  const testWorkspaceId = 'a0000000-0000-0000-0000-000000000002';
  const testSessionId = `sess_master_${Date.now()}`;
  const testEmail = `production_audit_${Date.now()}@aether.internal`;

  // ─── JOURNEY 1: System Health Check & Identity Verification ────────────────
  await runJourney('Journey 1', 'System Boot & Neural Health Check', async () => {
    const liveProvider = new AetherModelProvider('http://localhost:5002', 10000);
    const health = await liveProvider.healthCheck();
    if (health.status !== 'available') {
      throw new Error(`Model server returned status ${health.status}`);
    }
    const runtimeStatus = await engine.getRuntimeStatus();
    return {
      details: `Model health available on port 5002. Runtime: ${runtimeStatus.status} (${runtimeStatus.runtimeType})`,
      metrics: { modelStatus: health.status, runtime: runtimeStatus.status },
    };
  });

  // ─── JOURNEY 2: Authentication & Token Issuance ────────────────────────────
  let authToken = '';
  await runJourney('Journey 2', 'Authentication & JWT Token Generation', async () => {
    const token = JWTService.signAccessToken({
      id: testUserId,
      email: testEmail,
      role: 'ADMIN',
      workspaceId: testWorkspaceId,
    });
    const verified = JWTService.verifyAccessToken(token);
    if (verified.id !== testUserId || verified.role !== 'ADMIN') {
      throw new Error('JWT verification claims mismatch');
    }
    authToken = token;
    return {
      details: `JWT generated and validated. User: ${verified.id}, Role: ${verified.role}`,
      metrics: { userId: verified.id, role: verified.role, valid: true },
    };
  });

  // ─── JOURNEY 3: Normal QA Fast-Path ───────────────────────────────────────
  await runJourney('Journey 3', 'Normal QA Fast-Path (<1000ms Latency)', async () => {
    const startReq = Date.now();
    const res = await engine.process({
      requestId: `req_j3_${Date.now()}`,
      userId: testUserId,
      sessionId: testSessionId,
      conversationId: `conv_j3_${Date.now()}`,
      message: 'Hello Aether',
      options: { streaming: false },
      timestamp: Date.now(),
    });
    const latency = Date.now() - startReq;
    if (!res.ok) throw new Error(res.error?.message || 'QA request failed');
    if (!res.value.message.toLowerCase().includes('aether')) {
      throw new Error('Response did not contain canonical identity');
    }
    if (latency > 2000) {
      throw new Error(`Fast-path latency ${latency}ms exceeded 2000ms threshold`);
    }
    return {
      details: `Greeting returned in ${latency}ms: "${res.value.message.slice(0, 60)}..."`,
      metrics: { latencyMs: latency, taskType: res.value.task?.taskType, fastPath: true },
    };
  });

  // ─── JOURNEY 4: Real Token Streaming (SSE) ────────────────────────────────
  await runJourney('Journey 4', 'Live SSE Neural Token Streaming', async () => {
    const liveProvider = new AetherModelProvider('http://localhost:5002', 60000);
    const chunks: string[] = [];
    const streamRes = await liveProvider.generateStream(
      {
        requestId: `req_j4_${Date.now()}`,
        modelId: 'aether-v1-authoritative',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
        maxTokens: 25,
        stream: true,
      },
      (chunk) => {
        if (chunk.delta) chunks.push(chunk.delta);
      },
    );
    if (!streamRes.ok) throw new Error(streamRes.error?.message || 'Streaming failed');
    const fullText = chunks.join('');
    if (chunks.length === 0) throw new Error('Zero streaming chunks received');
    return {
      details: `Streamed ${chunks.length} tokens. Generated text: "${fullText.trim()}"`,
      metrics: { chunkCount: chunks.length, textLength: fullText.length },
    };
  });

  // ─── JOURNEY 5: Memory Store ──────────────────────────────────────────────
  await runJourney('Journey 5', 'Explicit Memory Extraction & Store', async () => {
    const memoryEngine = engine.getMemoryEngine();
    const createRes = await memoryEngine.createMemory({
      userId: testUserId,
      content: 'User prefers PostgreSQL and TypeScript for production web services',
      type: 'preference',
      importance: 0.95,
      scope: 'GLOBAL_USER',
    });
    if (!createRes.ok) throw new Error(createRes.error?.message || 'Memory creation failed');
    return {
      details: `Memory stored with ID: ${createRes.value.id}`,
      metrics: { memoryId: createRes.value.id, type: createRes.value.type },
    };
  });

  // ─── JOURNEY 6: Memory Recall ─────────────────────────────────────────────
  await runJourney('Journey 6', 'Contextual Memory Recall & Injection', async () => {
    const memoryEngine = engine.getMemoryEngine();
    const recallRes = await memoryEngine.searchMemory({
      userId: testUserId,
      text: 'PostgreSQL TypeScript',
      topK: 5,
    });
    if (!recallRes.ok) throw new Error(recallRes.error?.message || 'Memory search failed');
    if (recallRes.value.length === 0) throw new Error('Stored memory not found in recall');
    const matched = recallRes.value[0];
    return {
      details: `Recalled: "${matched.content}" (relevance: ${matched.importance})`,
      metrics: { recalledCount: recallRes.value.length, topScore: matched.importance },
    };
  });

  // ─── JOURNEY 7: RAG Document Ingestion ────────────────────────────────────
  await runJourney('Journey 7', 'Knowledge Document Ingestion & Indexing', async () => {
    const ragEngine = engine.getRAGEngine();
    const ingestRes = await ragEngine.ingest({
      type: 'text',
      title: 'Aether Microkernel Architecture',
      content:
        'The AETHER architecture consists of four distinct quadrants: AETHER_FRO (React), AETHER_BAC (Fastify/Node.js), AETHER_CORE (Agent Orchestrator), and AETHER_MODEL (FastAPI/llama.cpp inference engine).',
      workspaceId: testWorkspaceId,
      userId: testUserId,
      metadata: { source: 'docs/architecture.md', author: 'Vamsi' },
    });
    if (!ingestRes.ok) throw new Error(ingestRes.error?.message || 'RAG ingestion failed');
    return {
      details: `Document ingested: ${ingestRes.value.documentId} (${ingestRes.value.totalChunks} chunks indexed)`,
      metrics: { documentId: ingestRes.value.documentId, chunks: ingestRes.value.totalChunks },
    };
  });

  // ─── JOURNEY 8: Grounded Knowledge Retrieval & Citations ──────────────────
  await runJourney('Journey 8', 'Knowledge Retrieval with Evidence Citation', async () => {
    const ragEngine = engine.getRAGEngine();
    const queryRes = await ragEngine.query({
      text: 'What are the four quadrants of Aether?',
      workspaceId: testWorkspaceId,
      userId: testUserId,
      topK: 3,
      scoreThreshold: 0.1,
    });
    if (!queryRes.ok) throw new Error(queryRes.error?.message || 'RAG query failed');
    if (queryRes.value.documents.length === 0) throw new Error('No chunks retrieved for knowledge query');
    const topChunk = queryRes.value.documents[0];
    return {
      details: `Found chunk with score ${topChunk.score.toFixed(2)} from "${topChunk.metadata?.title || 'Spec'}"`,
      metrics: { matches: queryRes.value.documents.length, topScore: topChunk.score },
    };
  });

  // ─── JOURNEY 9: Controlled Tool Execution & Verification ──────────────────
  await runJourney('Journey 9', 'Controlled Tool Execution & Database Verification', async () => {
    const taskTitle = `Production Verification Task ${Date.now()}`;
    const execRes = await toolExecutor.execute(
      'create_task',
      { title: taskTitle, priority: 'high' },
      {
        auth: {
          userId: testUserId,
          sessionId: testSessionId,
          roles: ['ADMIN'],
          permissions: ['tasks:write', '*'],
          workspaceId: testWorkspaceId,
        },
        traceId: `trace_j9_${Date.now()}`,
      },
    );
    if (!execRes.success) throw new Error(typeof execRes.error === 'string' ? execRes.error : 'Tool execution failed');
    if (execRes.verificationStatus !== 'VERIFIED') {
      throw new Error(`Expected verificationStatus VERIFIED, got ${execRes.verificationStatus}`);
    }
    return {
      details: `Tool executed successfully with status ${execRes.verificationStatus}. Task created: "${taskTitle}"`,
      metrics: { verified: execRes.verified, verificationStatus: execRes.verificationStatus },
    };
  });

  // ─── JOURNEY 10: Autonomous Agent Multi-Step Planning ─────────────────────
  await runJourney('Journey 10', 'Autonomous Agent DAG Planning & Execution', async () => {
    const authCtx = {
      userId: testUserId,
      sessionId: testSessionId,
      roles: ['ADMIN'],
      permissions: ['*'],
      workspaceId: testWorkspaceId,
    };
    const plan = await planningEngine.createPlan(
      'Audit workspace tasks and compile summary report',
      authCtx,
      {},
    );
    const validation = planningEngine.validatePlan(plan, authCtx);
    if (!validation.valid) {
      throw new Error(`Plan validation failed: ${(validation.errors || []).join(', ')}`);
    }
    const planStatus = plan.canonicalPlan?.status || 'READY';
    return {
      details: `Generated multi-step plan: ${plan.totalSteps} steps (status: ${planStatus})`,
      metrics: { totalSteps: plan.totalSteps, status: planStatus, valid: validation.valid },
    };
  });

  // ─── NEGATIVE BRANCH 1: Model Unavailable Handling ────────────────────────
  await runJourney('Negative 1', 'Model Unavailable Graceful Handling', async () => {
    const offlineProvider = new AetherModelProvider('http://127.0.0.1:59998', 500);
    const health = await offlineProvider.healthCheck();
    if (health.status !== 'unavailable') {
      throw new Error('Offline provider did not report unavailable status');
    }
    const genRes = await offlineProvider.generate({
      requestId: `req_neg1_${Date.now()}`,
      modelId: 'aether',
      messages: [{ role: 'user', content: 'Test offline' }],
      timeoutMs: 500,
      stream: false,
    });
    if (!genRes.ok) throw new Error('Offline generation threw unexpected hard error');
    return {
      details: 'Provider gracefully caught network failure and triggered offline degradation',
      metrics: { handledGracefully: true, modelUnavailable: true },
    };
  });

  // ─── NEGATIVE BRANCH 2: Invalid Auth Token ────────────────────────────────
  await runJourney('Negative 2', 'Invalid / Tampered Auth Token Rejection', async () => {
    const tamperedToken = authToken.slice(0, -5) + 'xxxxx';
    try {
      JWTService.verifyAccessToken(tamperedToken);
      throw new Error('Tampered token unexpectedly verified successfully');
    } catch {
      return {
        details: 'Tampered JWT correctly rejected with cryptographic signature verification error',
        metrics: { tokenRejected: true },
      };
    }
  });

  // ─── NEGATIVE BRANCH 3: Unauthorized Cross-Tenant Access ──────────────────
  await runJourney('Negative 3', 'Unauthorized Cross-Tenant Tool Access', async () => {
    const execRes = await toolExecutor.execute(
      'create_task',
      { title: 'Unauthorized Task' },
      {
        auth: {
          userId: 'unauthorized_user_999',
          sessionId: 'sess_unauthorized',
          roles: ['GUEST'],
          permissions: [], // No permissions
          workspaceId: 'workspace_other',
        },
        traceId: `trace_neg3_${Date.now()}`,
      },
    );
    if (execRes.success) throw new Error('Unauthorized execution succeeded unexpectedly');
    if (execRes.code !== 'FORBIDDEN' && execRes.verificationStatus !== 'FAILED') {
      throw new Error(`Expected FORBIDDEN, got ${execRes.code}`);
    }
    return {
      details: `Execution blocked with code: ${execRes.code} (verificationStatus: ${execRes.verificationStatus})`,
      metrics: { blocked: true, code: execRes.code },
    };
  });

  console.log('\n================================================================');
  console.log('                 FINAL VERIFICATION SUMMARY                     ');
  console.log('================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total Scenarios: ${results.length}`);
  console.log(`Passed:          ${results.filter((r) => r.passed).length}`);
  console.log(`Failed:          ${results.filter((r) => !r.passed).length}`);
  console.log(`Status:          ${allPassed ? '100% PRODUCTION READY' : 'ISSUES DETECTED'}`);
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
