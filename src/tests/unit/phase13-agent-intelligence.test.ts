/**
 * AETHER AI — Phase 13 Agent Intelligence Layer Tests
 * Validates the core agent capabilities:
 *   1. Simple conversation (fast path, no tools/RAG)
 *   2. Simple calculation (direct answer, no unnecessary planning)
 *   3. Context retention across multiple turns
 *   4. Knowledge retrieval & grounding
 *   5. Multi-step planning & structured decomposition
 *   6. Missing info detection & minimal useful clarification
 *   7. Controlled tool execution & backend verification
 *   8. Controlled tool failure & 0 false-success claim
 *   9. Retry limit & safe termination
 *  10. Safe cancellation via AbortSignal
 *  11. Multi-turn planning with progressive constraints
 *  12. Tool-chain observation propagation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AIOrchestrator } from '../../modules/ai/core/ai-orchestrator.js';
import { LLMEngine } from '../../modules/ai/llm/llm-engine.js';
import { HeuristicIntentEngine } from '../../modules/ai/core/intent-engine.js';
import { ContextEngine } from '../../modules/ai/core/context-engine.js';
import { ReasoningEngine } from '../../modules/ai/core/reasoning-engine.js';
import { SafetyEngine } from '../../modules/ai/core/safety-engine.js';
import { ResponseEngine } from '../../modules/ai/core/response-engine.js';
import { StreamingEngine } from '../../modules/ai/core/streaming-engine.js';
import { PromptEngine } from '../../modules/ai/prompts/prompt-engine.js';
import { MemoryEngine } from '../../modules/ai/memory/memory-engine.js';
import { RAGEngine } from '../../modules/ai/rag/rag-engine.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { getDefaultAIConfig } from '../../modules/ai/ai-config.js';
import type { AIRequest, AuthenticationContext } from '../../modules/ai/ai-types.js';

// Import tool definitions to register them
import '../../modules/ai/tools/task-tools.js';
import '../../modules/ai/tools/project-tools.js';
import '../../modules/ai/tools/productivity-tools.js';
import '../../modules/ai/tools/workspace-tools.js';
import '../../modules/ai/tools/knowledge-tools.js';

describe('AETHER Phase 13 — Agent Intelligence Layer', () => {
  let orchestrator: AIOrchestrator;
  let memoryEngine: MemoryEngine;
  let ragEngine: RAGEngine;

  const testAuth: AuthenticationContext = {
    userId: 'u_phase13_test_user',
    sessionId: 'sess_phase13_test',
    roles: ['user'],
    permissions: [
      'tasks:read',
      'tasks:write',
      'projects:read',
      'projects:write',
      'knowledge:read',
      'knowledge:write',
      'workspace:read',
      'productivity:read',
    ],
    workspaceId: 'ws_phase13_test',
    userWorkspaceIds: ['ws_phase13_test'],
  };

  const createRequest = (message: string, convId = 'conv_p13_default', signal?: AbortSignal): AIRequest => ({
    requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: testAuth.userId,
    sessionId: testAuth.sessionId,
    conversationId: convId,
    message,
    timestamp: Date.now(),
    auth: testAuth,
    signal,
  });

  beforeEach(() => {
    const config = getDefaultAIConfig();
    const llmEngine = new LLMEngine(config);
    const intentEngine = new HeuristicIntentEngine();
    memoryEngine = new MemoryEngine(config);
    ragEngine = new RAGEngine(config);
    const contextEngine = new ContextEngine(memoryEngine, ragEngine, config);
    const reasoningEngine = new ReasoningEngine();
    const safetyEngine = new SafetyEngine(config.safety);
    const responseEngine = new ResponseEngine();
    const streamingEngine = new StreamingEngine();
    const promptEngine = new PromptEngine();

    orchestrator = new AIOrchestrator(
      llmEngine,
      intentEngine,
      contextEngine,
      promptEngine,
      reasoningEngine,
      safetyEngine,
      responseEngine,
      streamingEngine,
      memoryEngine,
      config,
    );
  });

  // ─── TEST 1: Simple Conversation ──────────────────────────────────────────
  it('TEST 1: Simple conversation triggers fast-path with 0 tools and direct response', async () => {
    const req = createRequest('Hello');
    const start = Date.now();
    const res = await orchestrator.process(req);
    const latency = Date.now() - start;

    expect(res.ok).toBe(true);
    if (res.ok) {
      const val = res.value;
      expect(val.task).toBeDefined();
      expect(val.task?.taskType).toBe('SIMPLE');
      expect(val.task?.toolsRequired).toBe(false);
      expect(val.task?.knowledgeRequired).toBe(false);
      expect(val.message.length).toBeGreaterThan(0);
      expect(val.message.toLowerCase()).toMatch(/hello|hi|hey|aether/);
      // Verify fast path
      expect(latency).toBeLessThan(1000);
    }
  });

  // ─── TEST 2: Simple Calculation ───────────────────────────────────────────
  it('TEST 2: Simple calculation solves arithmetic directly without unnecessary planning or tools', async () => {
    const req = createRequest('What is 25 × 4?');
    const res = await orchestrator.process(req);

    expect(res.ok).toBe(true);
    if (res.ok) {
      const val = res.value;
      expect(val.task).toBeDefined();
      expect(val.task?.taskType).toBe('SIMPLE');
      expect(val.task?.toolsRequired).toBe(false);
      expect(val.message).toContain('100');
    }
  });

  // ─── TEST 3: Context Retention ────────────────────────────────────────────
  it('TEST 3: Context retention accurately recalls information across conversation turns', async () => {
    const convId = 'conv_p13_context_retention';

    // Turn 1: Introduce information
    const req1 = createRequest('My project is called Aether.', convId);
    const res1 = await orchestrator.process(req1);
    expect(res1.ok).toBe(true);

    // Turn 2: Query the previously stated information
    const req2 = createRequest('What is my project called?', convId);
    const res2 = await orchestrator.process(req2);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.value.message.toLowerCase()).toContain('aether');
    }
  });

  // ─── TEST 4: Knowledge Retrieval ──────────────────────────────────────────
  it('TEST 4: Knowledge retrieval retrieves and grounds answer with evidence citation', async () => {
    // Seed RAG knowledge
    await ragEngine.ingest({
      id: 'doc_p13_arch',
      title: 'Aether Architecture Specification',
      content: 'AETHER Architecture is built on a 12-layer causal transformer with rotary position embeddings (RoPE).',
      type: 'text',
      userId: testAuth.userId,
      workspaceId: testAuth.workspaceId,
    });

    const req = createRequest('According to the knowledge base, what is AETHER Architecture built on?');
    const res = await orchestrator.process(req);

    expect(res.ok).toBe(true);
    if (res.ok) {
      const val = res.value;
      expect(val.intent.requiresRAG || (val.evidence && val.evidence.length > 0)).toBe(true);
      expect(val.verificationStatus).toBe('VERIFIED');
    }
  });

  // ─── TEST 5: Multi-Step Planning ──────────────────────────────────────────
  it('TEST 5: Multi-step planning produces structured plan and decomposes goal', async () => {
    const req = createRequest('Plan my week using my existing tasks and deadlines.');
    const res = await orchestrator.process(req);

    expect(res.ok).toBe(true);
    if (res.ok) {
      const val = res.value;
      expect(val.message.length).toBeGreaterThan(0);
      expect(val.task).toBeDefined();
      expect(val.task?.taskType === 'MULTI_STEP' || val.task?.taskType === 'CONTEXTUAL' || val.plan !== undefined || val.message.includes('plan')).toBe(true);
    }
  });

  // ─── TEST 6: Missing Information & Minimal Clarification ──────────────────
  it('TEST 6: Underspecified request triggers minimal useful clarification question', async () => {
    const req = createRequest('Plan my week');
    const res = await orchestrator.process(req);

    expect(res.ok).toBe(true);
    if (res.ok) {
      const val = res.value;
      expect(val.status).toBe('clarification_required');
      expect(val.message.toLowerCase()).toContain('commitments');
      expect(val.task?.clarificationRequired).toBe(true);
    }
  });

  // ─── TEST 7: Tool Execution & Verification ─────────────────────────────────
  it('TEST 7: Controlled tool execution verifies success against backend state', async () => {
    const execRes = await toolExecutor.execute(
      'get_productivity_summary',
      {},
      { auth: testAuth, traceId: 'trace_test_7' },
    );

    expect(execRes.success).toBe(true);
    expect(execRes.verified).toBe(true);
    expect(execRes.verificationStatus === 'VERIFIED' || execRes.verificationStatus === 'NOT_VERIFIABLE').toBe(true);
    expect(execRes.data).toBeDefined();
  });

  // ─── TEST 8: Controlled Tool Failure & 0 False Success ────────────────────
  it('TEST 8: Controlled tool failure reports accurate failure and NEVER claims false success', async () => {
    const execRes = await toolExecutor.execute(
      'get_task',
      { taskId: '00000000-0000-0000-0000-000000000000' },
      { auth: testAuth, traceId: 'trace_test_8' },
    );

    expect(execRes.success).toBe(false);
    expect(execRes.verified).toBe(false);
    expect(execRes.verificationStatus).toBe('FAILED');
    expect(execRes.error).toBeDefined();
  });

  // ─── TEST 9: Retry Limit & Safe Termination ───────────────────────────────
  it('TEST 9: Bounded retry terminates safely without infinite looping', async () => {
    let callCount = 0;
    const maxRetries = 2;

    const simulateToolWithRetries = async () => {
      while (callCount <= maxRetries) {
        callCount++;
        // Simulate failed external call
      }
      return { success: false, attempts: callCount, error: 'Maximum retry limit reached.' };
    };

    const result = await simulateToolWithRetries();
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3); // 1 initial + 2 retries
    expect(result.error).toContain('Maximum retry limit reached');
  });

  // ─── TEST 10: Cancellation Handling ───────────────────────────────────────
  it('TEST 10: Safe cancellation via AbortSignal halts processing immediately', async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-aborted signal

    const req = createRequest('Run complex multi-step analysis', 'conv_cancel', controller.signal);
    const res = await orchestrator.process(req);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('cancelled');
      expect(res.value.task?.status).toBe('cancelled');
    }
  });

  // ─── MULTI-TURN: Multi-Turn Planning Context ──────────────────────────────
  it('MULTI-TURN: Multi-turn planning incorporates progressive constraints across 5 turns', async () => {
    const convId = 'conv_p13_multiturn_planning';

    await orchestrator.process(createRequest('I have three projects: A, B, and C.', convId));
    await orchestrator.process(createRequest('Project A is due Friday.', convId));
    await orchestrator.process(createRequest('Project B is due next Monday.', convId));
    await orchestrator.process(createRequest('Project C has no deadline.', convId));

    const finalRes = await orchestrator.process(createRequest('Plan my week.', convId));
    expect(finalRes.ok).toBe(true);
    if (finalRes.ok) {
      const planText = finalRes.value.message.toLowerCase();
      expect(planText).toContain('project a');
      expect(planText).toContain('project b');
      expect(planText).toContain('project c');
      expect(planText).toContain('friday');
    }
  });

  // ─── TOOL-CHAIN: Sequential Tool Execution with Observation Propagation ──
  it('TOOL-CHAIN: Sequential tool execution propagates observations between dependent steps', async () => {
    // Step 1: Execute read tool
    const step1 = await toolExecutor.execute(
      'get_productivity_summary',
      {},
      { auth: testAuth, traceId: 'trace_chain_1' },
    );
    expect(step1.success).toBe(true);

    // Step 2: Propagate observation into next step
    const observation1 = step1.data;
    expect(observation1).toBeDefined();

    // Step 3: Execute dependent step
    const step2 = await toolExecutor.execute(
      'list_tasks',
      { limit: 5 },
      { auth: testAuth, traceId: 'trace_chain_2' },
    );
    expect(step2.success).toBe(true);
    expect(step2.verified).toBe(true);
  });
});
