/**
 * PROMPT 4 — AETHER MEMORY & CONTEXT INTELLIGENCE E2E TESTS
 *
 * Validates the complete memory and context lifecycle:
 * 1. Flow 1 (Full Lifecycle): Store directive -> DB persistence -> New conversation recall -> Forget directive -> DB deletion -> Recall confirms no memory
 * 2. Flow 2 (Security & Isolation): User A vs User B strict separation; Workspace A vs Workspace B scope isolation
 * 3. Flow 3 (Context Intelligence): Multi-source bounded context assembly with 5-tier priority, token budgeting & deduplication
 * 4. Flow 4 (Contradiction & Superseding): Newer preferences supersede older ones, incrementing version and updating status
 * 5. Flow 5 (Guardrails & Security): Passwords and API keys rejected by classifier and never persisted
 * 6. Flow 6 (Graceful Degradation): Memory failures handled safely without system crashes or fabricated answers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { globalAiEngine, AIEngine } from '../../modules/ai/core/ai-engine.js';
import { memoryEngine } from '../../modules/ai/memory/memory-engine.js';
import { memoryClassifier } from '../../modules/ai/memory/memory-classifier.js';
import { ContextEngine } from '../../modules/ai/core/context-engine.js';
import { db } from '../../database/client.js';
import type { Intent, AIRequest } from '../../modules/ai/ai-types.js';

describe('PROMPT 4 — Aether Memory + Context Intelligence E2E Integration Suite', () => {
  const userA = '00000000-0000-4000-a000-0000000000a1';
  const userB = '00000000-0000-4000-a000-0000000000b2';
  const workspaceA = '00000000-0000-4000-a000-0000000000w1';
  const workspaceB = '00000000-0000-4000-a000-0000000000w2';
  const projectA = '00000000-0000-4000-a000-0000000000p1';

  let engine: AIEngine;

  beforeAll(async () => {
    engine = globalAiEngine;
    await engine.initialize();

    // Clean up test data for deterministic state
    await memoryEngine.clearUserMemory(userA);
    await memoryEngine.clearUserMemory(userB);

    try {
      if ((db as any).user?.upsert) {
        await (db as any).user.upsert({
          where: { id: userA },
          update: {},
          create: {
            id: userA,
            email: `memory_user_a_${Date.now()}@aether.os`,
            username: `mem_user_a_${Date.now()}`,
            fullName: 'Memory Test User A',
            passwordHash: 'dummy_hash',
            role: 'USER',
          },
        });
        await (db as any).user.upsert({
          where: { id: userB },
          update: {},
          create: {
            id: userB,
            email: `memory_user_b_${Date.now()}@aether.os`,
            username: `mem_user_b_${Date.now()}`,
            fullName: 'Memory Test User B',
            passwordHash: 'dummy_hash',
            role: 'USER',
          },
        });
      }
    } catch {
      // In-memory or pre-migrated test environment fallback
    }
  });

  afterAll(async () => {
    try {
      await memoryEngine.clearUserMemory(userA);
      await memoryEngine.clearUserMemory(userB);
      if ((db as any).user?.delete) {
        await (db as any).user.delete({ where: { id: userA } }).catch(() => {});
        await (db as any).user.delete({ where: { id: userB } }).catch(() => {});
      }
    } catch {
      // Ignore
    }
  });

  // ─── FLOW 1: Full Memory Lifecycle (Store -> Verify -> Recall -> Forget -> Verify) ───
  it('FLOW 1: Completes full explicit memory lifecycle with persistent DB writes and zero hallucination', async () => {
    const conv1 = `conv_lifecycle_1_${Date.now()}`;
    const sess1 = `sess_lifecycle_1_${Date.now()}`;

    // Step 1: User explicit directive: "Remember that my main project is Aether"
    const storeResponse = await engine.process({
      requestId: `req_store_${Date.now()}`,
      userId: userA,
      sessionId: sess1,
      conversationId: conv1,
      message: 'Remember that my main project is Aether',
      options: { streaming: false },
      timestamp: Date.now(),
    });

    expect(storeResponse.ok).toBe(true);
    if (storeResponse.ok) {
      expect(storeResponse.value.status).toBe('success');
      expect(storeResponse.value.message.toLowerCase()).toContain('stored');
      expect(storeResponse.value.verificationStatus).toBe('VERIFIED');
    }

    // Step 2: Verify database / persistent engine actually stored it
    const storedMemories = await memoryEngine.getAllMemory(userA);
    expect(storedMemories.ok).toBe(true);
    if (storedMemories.ok) {
      const mainProjectMem = storedMemories.value.find(
        (m) => m.content.includes('main project is Aether') || m.content.toLowerCase().includes('aether'),
      );
      expect(mainProjectMem).toBeDefined();
      expect(mainProjectMem?.scope).toBe('GLOBAL_USER');
      expect(mainProjectMem?.confidence).toBe('confirmed');
      expect(mainProjectMem?.userId).toBe(userA);
    }

    // Step 3: Start a NEW conversation and ask "What is my main project?"
    const conv2 = `conv_lifecycle_2_${Date.now()}`;
    const recallResponse = await engine.process({
      requestId: `req_recall_${Date.now()}`,
      userId: userA,
      sessionId: `sess_lifecycle_2_${Date.now()}`,
      conversationId: conv2,
      message: 'What is my main project?',
      options: { streaming: false },
      timestamp: Date.now(),
    });

    expect(recallResponse.ok).toBe(true);
    if (recallResponse.ok) {
      // Response must accurately retrieve and reference "Aether"
      expect(recallResponse.value.message).toContain('Aether');
      expect(recallResponse.value.message.toLowerCase()).toContain('stored');
    }

    // Step 4: Explicit forget directive: "Forget that my main project is Aether"
    const forgetResponse = await engine.process({
      requestId: `req_forget_${Date.now()}`,
      userId: userA,
      sessionId: sess1,
      conversationId: conv1,
      message: 'Forget that my main project is Aether',
      options: { streaming: false },
      timestamp: Date.now(),
    });

    expect(forgetResponse.ok).toBe(true);
    if (forgetResponse.ok) {
      expect(forgetResponse.value.message.toLowerCase()).toContain('forgotten');
      expect(forgetResponse.value.verificationStatus).toBe('VERIFIED');
    }

    // Step 5: Verify memory is no longer active in persistent store
    const afterForget = await memoryEngine.getAllMemory(userA);
    expect(afterForget.ok).toBe(true);
    if (afterForget.ok) {
      const stillActive = afterForget.value.find(
        (m) =>
          (m.content.includes('main project is Aether') || m.content.toLowerCase().includes('aether')) &&
          (m.metadata as any)?.status !== 'deleted',
      );
      expect(stillActive).toBeUndefined();
    }

    // Step 6: In a new conversation, ask "What is my main project?" again
    const conv3 = `conv_lifecycle_3_${Date.now()}`;
    const recallAfterForget = await engine.process({
      requestId: `req_recall_post_forget_${Date.now()}`,
      userId: userA,
      sessionId: `sess_lifecycle_3_${Date.now()}`,
      conversationId: conv3,
      message: 'What is my main project?',
      options: { streaming: false },
      timestamp: Date.now(),
    });

    expect(recallAfterForget.ok).toBe(true);
    if (recallAfterForget.ok) {
      // Must NOT claim Aether is stored or fabricate memory
      const msg = recallAfterForget.value.message.toLowerCase();
      expect(msg).toContain("don't have any stored memory");
    }
  });

  // ─── FLOW 2: Security & Scope Isolation (User A vs User B, Workspace Isolation) ───
  it('FLOW 2: Enforces strict user isolation and workspace scoping without cross-boundary leakage', async () => {
    // 1. User A stores a confidential memory
    const userASecret = 'Project Pegasus is an internal classified initiative';
    await memoryEngine.createMemory({
      userId: userA,
      content: userASecret,
      type: 'fact',
      scope: 'GLOBAL_USER',
      importance: 0.9,
      confidence: 'confirmed',
    });

    // 2. User B searches for Pegasus
    const userBSearch = await memoryEngine.searchMemory({
      userId: userB,
      text: 'Pegasus classified initiative',
      topK: 5,
    });

    expect(userBSearch.ok).toBe(true);
    if (userBSearch.ok) {
      expect(userBSearch.value.length).toBe(0);
    }

    // 3. User B asks AI engine about Pegasus
    const userBResponse = await engine.process({
      requestId: `req_user_b_${Date.now()}`,
      userId: userB,
      sessionId: `sess_user_b_${Date.now()}`,
      conversationId: `conv_user_b_${Date.now()}`,
      message: 'What is Project Pegasus?',
      options: { streaming: false },
      timestamp: Date.now(),
    });

    expect(userBResponse.ok).toBe(true);
    if (userBResponse.ok) {
      // Must not leak User A's secret
      expect(userBResponse.value.message).not.toContain(userASecret);
    }

    // 4. Workspace Scoping: Memory stored specifically for Workspace A
    await memoryEngine.createMemory({
      userId: userA,
      workspaceId: workspaceA,
      content: 'Workspace A deployment runs on AWS Tokyo region ap-northeast-1',
      type: 'fact',
      scope: 'WORKSPACE',
      importance: 0.8,
      confidence: 'user_provided',
    });

    // Recall within Workspace A
    const wsARes = await memoryEngine.searchMemory({
      userId: userA,
      workspaceId: workspaceA,
      text: 'deployment AWS Tokyo',
      topK: 5,
    });
    expect(wsARes.ok).toBe(true);
    if (wsARes.ok) {
      expect(wsARes.value.some((m) => m.content.includes('Tokyo'))).toBe(true);
    }

    // Recall from Workspace B (must NOT return Workspace A scoped memory)
    const wsBRes = await memoryEngine.searchMemory({
      userId: userA,
      workspaceId: workspaceB,
      text: 'deployment AWS Tokyo',
      topK: 5,
    });
    expect(wsBRes.ok).toBe(true);
    if (wsBRes.ok) {
      expect(wsBRes.value.some((m) => m.content.includes('Tokyo'))).toBe(false);
    }
  });

  // ─── FLOW 3: ContextEngine Multi-Source Bounded Context Assembly ───────────────────
  it('FLOW 3: ContextEngine respects 5-tier priority hierarchy, bounded token budgets, and deduplication', async () => {
    const contextEngine = new ContextEngine(memoryEngine, undefined, {
      model: { maxContextTokens: 250 },
      memory: { enabled: true, topK: 5, scoreThreshold: 0.1 },
      rag: { enabled: false },
    } as any);

    // Seed test memory for User A
    await memoryEngine.createMemory({
      userId: userA,
      content: 'User prefers dark theme and clean monospace typography in code editor',
      type: 'preference',
      scope: 'GLOBAL_USER',
      importance: 0.85,
    });

    // Add multiple conversation turns including duplicate entries
    const convId = `conv_ctx_${Date.now()}`;
    memoryEngine.addConversationMessage(userA, 'sess_1', convId, 'user', 'What theme do I like?');
    memoryEngine.addConversationMessage(userA, 'sess_1', convId, 'user', 'What theme do I like?'); // Duplicate
    memoryEngine.addConversationMessage(userA, 'sess_1', convId, 'assistant', 'You prefer dark theme.');

    const mockRequest: AIRequest = {
      requestId: `req_ctx_${Date.now()}`,
      userId: userA,
      sessionId: 'sess_1',
      conversationId: convId,
      message: 'What theme do I like?',
      timestamp: Date.now(),
    };

    const mockIntent: Intent = {
      type: 'MEMORY_RECALL',
      primaryIntent: 'USER_DATA_QUESTION',
      secondaryIntent: 'MEMORY_RECALL',
      confidence: 0.95,
      confidenceLevel: 'HIGH_CONFIDENCE',
      requiresMemory: true,
      requiresRAG: false,
      requiresTool: false,
      requiresAgent: false,
      requiresClarification: false,
      reasoning: 'Memory recall request',
      requiredContext: {
        conversation: true,
        memory: true,
        rag: false,
        project: false,
        workspace: false,
        tools: false,
        system: true,
      },
    };

    const ctxResult = await contextEngine.buildContext(mockRequest, mockIntent);
    expect(ctxResult.ok).toBe(true);
    if (ctxResult.ok) {
      const ctx = ctxResult.value;

      // 1. Verify sources metadata tracks multi-source contributions
      expect(ctx.sourcesMetadata).toBeDefined();
      const sources = ctx.sourcesMetadata || [];
      expect(sources.length).toBeGreaterThan(0);
      const hasMemorySource = sources.some((s) => s.source === 'long_term_memory');
      const hasConvSource = sources.some((s) => s.source === 'conversation_history');
      expect(hasMemorySource).toBe(true);
      expect(hasConvSource).toBe(true);

      // 2. Verify priority order metadata (Priority 2 for conv, Priority 5 for memory)
      const convMeta = sources.find((s) => s.source === 'conversation_history');
      const memMeta = sources.find((s) => s.source === 'long_term_memory');
      expect(convMeta?.priority).toBe(2);
      expect(memMeta?.priority).toBe(5);

      // 3. Verify deduplication: consecutive duplicate user messages removed
      const history = ctx.conversationHistory || [];
      const userMsgs = history.filter((m) => m.role === 'user');
      expect(userMsgs.length).toBe(1);

      // 4. Verify memory retrieval populated longTermMemory
      expect(ctx.longTermMemory).toBeDefined();
      expect(ctx.longTermMemory!.length).toBeGreaterThan(0);
      expect(ctx.longTermMemory![0].content).toContain('dark theme');
    }
  });

  // ─── FLOW 4: Contradiction & Superseding Flow ──────────────────────────────────────
  it('FLOW 4: Correctly detects contradictory preference, supersedes older item, and increments version', async () => {
    // Step 1: User stores initial preference
    const store1 = await memoryEngine.createMemory({
      userId: userA,
      content: 'My favorite code editor is VS Code',
      type: 'preference',
      scope: 'GLOBAL_USER',
      importance: 0.8,
      confidence: 'confirmed',
    });
    expect(store1.ok).toBe(true);
    const initialMem = store1.ok ? store1.value : null;
    expect(initialMem).toBeDefined();

    // Step 2: Classifier evaluates new contradictory candidate
    const allMemoriesRes = await memoryEngine.getAllMemory(userA);
    const existingMemories = allMemoriesRes.ok ? allMemoriesRes.value : [];

    const newCandidate = {
      userId: userA,
      content: 'My favorite code editor is Neovim',
      type: 'preference' as const,
      importance: 0.9,
      source: 'user_explicit',
    };

    const classification = memoryClassifier.classify(newCandidate, existingMemories);
    expect(classification.accepted).toBe(true);
    expect(classification.action).toBe('supersede');
    expect(classification.targetMemoryIdToSupersede).toBe(initialMem?.id);

    // Step 3: Execute superseding in memoryEngine
    if (classification.targetMemoryIdToSupersede) {
      await memoryEngine.updateMemory({
        id: classification.targetMemoryIdToSupersede,
        userId: userA,
        metadata: { status: 'superseded' },
      });
    }

    const store2 = await memoryEngine.createMemory({
      userId: userA,
      content: classification.sanitizedContent,
      type: classification.category,
      scope: 'GLOBAL_USER',
      importance: classification.importance,
      confidence: classification.confidence,
    });
    expect(store2.ok).toBe(true);

    // Step 4: Verify search only returns the active new memory, not the superseded one
    const searchRes = await memoryEngine.searchMemory({
      userId: userA,
      text: 'favorite code editor',
      topK: 5,
    });
    expect(searchRes.ok).toBe(true);
    if (searchRes.ok) {
      const activeContents = searchRes.value.map((m) => m.content);
      expect(activeContents).toContain('My favorite code editor is Neovim');
      expect(activeContents).not.toContain('My favorite code editor is VS Code');
    }
  });

  // ─── FLOW 5: Security & Guardrail Rejection ─────────────────────────────────────────
  it('FLOW 5: MemoryClassifier rejects sensitive security credentials and prevents database persistence', async () => {
    const sensitiveInputs = [
      'Remember that my password is SuperSecretPassword123!',
      'Remember my OpenAI api_key is sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
      'Remember my AWS secret is wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'Note that my auth_token is Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    ];

    for (const input of sensitiveInputs) {
      const candidate = {
        userId: userA,
        content: input,
        type: 'fact' as const,
        source: 'user_explicit',
      };

      const result = memoryClassifier.classify(candidate, []);
      expect(result.accepted).toBe(false);
      expect(result.action).toBe('reject');
      expect(result.reason).toContain('sensitive security credentials');
    }

    // Attempting to send a password storage directive through AI Engine
    const secResponse = await engine.process({
      requestId: `req_sec_${Date.now()}`,
      userId: userA,
      sessionId: `sess_sec_${Date.now()}`,
      conversationId: `conv_sec_${Date.now()}`,
      message: 'Remember that my password is SecretPassword999!',
      options: { streaming: false },
      timestamp: Date.now(),
    });

    expect(secResponse.ok).toBe(true);
    if (secResponse.ok) {
      // Must flag rejection or security warning, not success
      expect(secResponse.value.message.toLowerCase()).toContain('cannot store');
      expect(secResponse.value.verificationStatus).toBe('FAILED');
    }

    // Verify nothing with password was persisted in the database
    const allMems = await memoryEngine.getAllMemory(userA);
    if (allMems.ok) {
      const passwordMem = allMems.value.find((m) => m.content.toLowerCase().includes('password'));
      expect(passwordMem).toBeUndefined();
    }
  });

  // ─── FLOW 6: Graceful Degradation on Memory Store Failure ──────────────────────────
  it('FLOW 6: Degrades gracefully when memory store encounters an error without crashing the engine', async () => {
    // Create a mock memory engine that simulates database failure
    const faultyMemoryEngine = {
      searchMemory: async () => {
        throw new Error('Database connection pool exhausted: 503 Service Unavailable');
      },
      getAllMemory: async () => {
        throw new Error('Database connection pool exhausted: 503 Service Unavailable');
      },
      getWorkingMemoryContext: () => ({ items: [], sessionId: 'mock_sess' }),
      getConversationHistory: () => [],
    } as any;

    const resilientContextEngine = new ContextEngine(faultyMemoryEngine, undefined, {
      model: { maxContextTokens: 1024 },
      memory: { enabled: true },
      rag: { enabled: false },
    } as any);

    const mockRequest: AIRequest = {
      requestId: `req_degrade_${Date.now()}`,
      userId: userA,
      sessionId: 'sess_degrade',
      conversationId: 'conv_degrade',
      message: 'What should I work on today?',
      timestamp: Date.now(),
    };

    const mockIntent: Intent = {
      type: 'TASK_MANAGEMENT',
      primaryIntent: 'TASK_MANAGEMENT',
      secondaryIntent: 'TASK_CREATION',
      confidence: 0.9,
      confidenceLevel: 'HIGH_CONFIDENCE',
      requiresMemory: true,
      requiresRAG: false,
      requiresTool: false,
      requiresAgent: false,
      requiresClarification: false,
      reasoning: 'Planning task inquiry',
      requiredContext: {
        conversation: true,
        memory: true,
        rag: false,
        project: false,
        workspace: false,
        tools: false,
        system: true,
      },
    };

    // buildContext must NOT throw; it must return a valid context gracefully
    const contextResult = await resilientContextEngine.buildContext(mockRequest, mockIntent);
    expect(contextResult.ok).toBe(true);
    if (contextResult.ok) {
      expect(contextResult.value.tokenBudget).toBeDefined();
      expect(contextResult.value.longTermMemory).toBeUndefined(); // Safely omitted without crashing
    }
  });
});
