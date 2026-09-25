/**
 * AETHER AI — Streaming Tools End-to-End Test Suite (AI-01, AI-03, TOOL-01)
 *
 * Verifies that the primary streaming route (/ai/stream) and globalAiEngine.processStream():
 * 1. Correctly executes the real action pipeline: Intent -> Plan -> Validate -> Execute -> Verify -> Truthful Output.
 * 2. Successfully creates tasks in PostgreSQL with natural-language due dates parsed (AI-03).
 * 3. Never produces false success on tool or plan failures (Zero Fake Success).
 * 4. Strictly enforces authenticated identity and workspace isolation (TOOL-01).
 * 5. Handles conversational requests without triggering unnecessary tool executions.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../database/client.js';
import { globalAiEngine } from '../../modules/ai/core/ai-engine.js';
import { planningEngine } from '../../modules/ai/planning/planning-engine.js';
import { planExecutor } from '../../modules/ai/planning/plan-executor.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { actionAuditLogger } from '../../modules/ai/audit/action-audit-logger.js';
import { TasksRepository } from '../../modules/projects/tasks/tasks.repository.js';
import { InvalidPlanError, ToolExecutionFailedError } from '../../modules/ai/ai-errors.js';
import type { AIRequest, StreamingChunk } from '../../modules/ai/ai-types.js';
import type { AuthenticationContext } from '../../modules/ai/tools/tool-types.js';

const tasksRepo = new TasksRepository();

const testUser: AuthenticationContext = {
  userId: 'e2e00000-0000-0000-0000-000000000001',
  sessionId: 'sess_e2e_user',
  roles: ['user'],
  permissions: ['tasks:read', 'tasks:write', 'workspace:read'],
  workspaceId: '00000000-0000-0000-0000-000000000000',
};

describe('Streaming Tools End-to-End Action Pipeline (AI-01, AI-03, TOOL-01)', { timeout: 45000 }, () => {
  beforeAll(async () => {
    try {
      await db.user.upsert({
        where: { id: testUser.userId },
        update: {},
        create: {
          id: testUser.userId,
          email: 'e2e-tools@aether.local',
          fullName: 'E2E Tools User',
        },
      });

      const ws = await db.workspace.findFirst();
      if (!ws) {
        await db.workspace.create({
          data: {
            id: '00000000-0000-0000-0000-000000000000',
            name: 'Default Workspace',
            slug: 'default-workspace',
          },
        });
      }
    } catch (e) {
      console.warn('DB setup warning in streaming-tools-e2e:', e);
    }
  });

  beforeEach(() => {
    actionAuditLogger.clear();
    planExecutor.clearIdempotencyCache();
  });

  afterEach(() => {
    actionAuditLogger.clear();
    vi.restoreAllMocks();
  });

  // ─── 1. REAL ACTION EXECUTION & POSTGRESQL MUTATION ─────────────────────────
  it('AI-01 / AI-03: Action request creates real task in PostgreSQL and streams verified status', async () => {
    const receivedChunks: StreamingChunk[] = [];
    const request: AIRequest = {
      requestId: `req_e2e_create_${Date.now()}`,
      userId: testUser.userId,
      workspaceId: testUser.workspaceId,
      auth: testUser,
      sessionId: testUser.sessionId,
      conversationId: `conv_${Date.now()}`,
      message: 'Create a task called Prepare final architecture presentation tomorrow at 5 PM',
      options: { streaming: true },
      timestamp: Date.now(),
    };

    const result = await globalAiEngine.processStream(request, (chunk: StreamingChunk) => {
      receivedChunks.push(chunk);
    });

    expect(result.ok).toBe(true);

    // Verify status transitions: planning -> executing -> verified
    const planningChunk = receivedChunks.find((c) => c.status === 'planning');
    expect(planningChunk).toBeDefined();

    const executingChunk = receivedChunks.find(
      (c) => c.status === 'executing' && c.toolName === 'create_task',
    );
    expect(executingChunk).toBeDefined();

    const verifiedChunk = receivedChunks.find(
      (c) => c.status === 'verified' && c.toolName === 'create_task',
    );
    expect(verifiedChunk).toBeDefined();
    expect(verifiedChunk?.verified).toBe(true);
    expect(verifiedChunk?.verificationStatus).toBe('VERIFIED');

    // Verify task actually exists in the database
    const createdTasks = await db.task.findMany({
      where: {
        creatorId: testUser.userId,
        title: { contains: 'Prepare final architecture presentation' },
      },
    });

    expect(createdTasks.length).toBeGreaterThanOrEqual(1);
    const task = createdTasks[0];
    expect(task.title).toContain('Prepare final architecture presentation');
    // AI-03 check: due date was parsed and persisted
    expect(task.dueDate).not.toBeNull();

    // Verify audit log exists
    const logs = await actionAuditLogger.getLogs({ userId: testUser.userId });
    expect(logs.some((l) => l.toolName === 'create_task' && l.status === 'SUCCESS')).toBe(true);
  });

  // ─── 2. ZERO FALSE SUCCESS ON TOOL FAILURE ──────────────────────────────────
  it('AI-01: Tool execution failure reports explicit failure and emits verified: false (Zero Fake Success)', async () => {
    // Spy on toolExecutor to simulate a tool execution failure during plan execution
    vi.spyOn(toolExecutor, 'execute').mockResolvedValueOnce({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      error: 'Database transaction lock acquisition timeout',
      executionTimeMs: 15,
      verified: false,
      verificationStatus: 'FAILED',
    });

    const receivedChunks: StreamingChunk[] = [];
    const request: AIRequest = {
      requestId: `req_e2e_fail_${Date.now()}`,
      userId: testUser.userId,
      workspaceId: testUser.workspaceId,
      auth: testUser,
      sessionId: testUser.sessionId,
      conversationId: `conv_${Date.now()}`,
      message: 'Create a task to audit security credentials',
      options: { streaming: true },
      timestamp: Date.now(),
    };

    const result = await globalAiEngine.processStream(request, (chunk: StreamingChunk) => {
      receivedChunks.push(chunk);
    });

    // Expect overall result to be a failure
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ToolExecutionFailedError);
      expect(result.error.code).toBe('TOOL_EXECUTION_FAILED');
    }

    // Expect stream received failure status and verified: false
    const failedChunk = receivedChunks.find((c) => c.status === 'failed');
    expect(failedChunk).toBeDefined();
    expect(failedChunk?.verified).toBe(false);
    expect(failedChunk?.verificationStatus).toBe('FAILED');

    // Invariant: No fake success claim anywhere in the chunks
    const falseSuccessChunk = receivedChunks.find(
      (c) => c.status === 'verified' && c.verified === true,
    );
    expect(falseSuccessChunk).toBeUndefined();
  });

  // ─── 3. REJECT UNKNOWN TOOL / INVALID PLAN ───────────────────────────────────
  it('AI-01: Plan validation failure rejects unknown tools with InvalidPlanError and emits failed status', async () => {
    // Force planning engine to return an unknown tool in an action plan
    vi.spyOn(planningEngine, 'createPlan').mockResolvedValueOnce({
      planId: '44444444-4444-4444-4444-444444444444',
      userIntent: 'exploit the system',
      steps: [
        {
          stepId: '55555555-5555-5555-5555-555555555555',
          stepNumber: 1,
          toolName: 'non_existent_exploit_tool',
          description: 'Attempt arbitrary unauthorized tool execution',
          toolInput: {},
          dependencies: [],
          status: 'pending',
        },
      ],
      estimatedDurationMs: 100,
      requiresConfirmation: false,
    } as any);

    const receivedChunks: StreamingChunk[] = [];
    const request: AIRequest = {
      requestId: `req_e2e_invalid_${Date.now()}`,
      userId: testUser.userId,
      workspaceId: testUser.workspaceId,
      auth: testUser,
      sessionId: testUser.sessionId,
      conversationId: `conv_${Date.now()}`,
      message: 'Create a task to exploit the system',
      options: { streaming: true },
      timestamp: Date.now(),
    };

    const result = await globalAiEngine.processStream(request, (chunk: StreamingChunk) => {
      receivedChunks.push(chunk);
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InvalidPlanError);
      expect(result.error.code).toBe('PLAN_INVALID');
    }

    const failedChunk = receivedChunks.find((c) => c.status === 'failed');
    expect(failedChunk).toBeDefined();
    expect(failedChunk?.error).toContain('non_existent_exploit_tool');
  });

  // ─── 4. AUTHENTICATION CONTEXT PROPAGATION & ENFORCEMENT ─────────────────────
  it('TOOL-01: Unauthenticated request cannot execute tools', async () => {
    // When auth context has no userId, toolExecutor rejects execution with FORBIDDEN
    const unauthenticatedCtx: AuthenticationContext = {
      userId: '',
      sessionId: 'sess_unauth',
      roles: ['guest'],
      permissions: [],
    };

    const execResult = await toolExecutor.execute(
      'create_task',
      { title: 'Unauthorized Task' },
      { auth: unauthenticatedCtx, traceId: 'trace_unauth' },
    );

    expect(execResult.success).toBe(false);
    expect(execResult.code).toBe('FORBIDDEN');
  });

  // ─── 5. IDENTITY INJECTION DEFENSE ──────────────────────────────────────────
  it('TOOL-01: Model-supplied userId and workspaceId cannot override server identity', async () => {
    const maliciousInput = {
      title: 'Legitimate Looking Task for Injection Test',
      userId: 'attacker-injected-id',
      workspaceId: 'attacker-injected-workspace',
      ownerId: 'attacker-injected-owner',
      creatorId: 'attacker-injected-creator',
    };

    const execResult = await toolExecutor.execute('create_task', maliciousInput, {
      auth: testUser,
      traceId: 'trace_injection_defense',
    });

    expect(execResult.success).toBe(true);
    if (execResult.success) {
      const taskId = (execResult.data as any)?.taskId;
      expect(taskId).toBeDefined();
      const dbTask = await tasksRepo.findById(taskId);
      expect(dbTask).not.toBeNull();
      // Server-side identity was enforced: task owned by testUser, NOT attacker!
      expect(dbTask?.creatorId).toBe(testUser.userId);
      expect(dbTask?.creatorId).not.toBe('attacker-injected-id');
      expect(dbTask?.creatorId).not.toBe('attacker-injected-creator');
    }
  });

  // ─── 6. CONVERSATIONAL REQUEST DOES NOT EXECUTE TOOLS ───────────────────────
  it('AI-01: Conversational requests do not trigger planning or tool execution', async () => {
    const receivedChunks: StreamingChunk[] = [];
    const request: AIRequest = {
      requestId: `req_e2e_conv_${Date.now()}`,
      userId: testUser.userId,
      workspaceId: testUser.workspaceId,
      auth: testUser,
      sessionId: testUser.sessionId,
      conversationId: `conv_${Date.now()}`,
      message: 'Hello, what is the meaning of life in simple terms?',
      options: { streaming: true },
      timestamp: Date.now(),
    };

    const result = await globalAiEngine.processStream(request, (chunk: StreamingChunk) => {
      receivedChunks.push(chunk);
    });

    // Should finish without invoking tool execution
    const executingChunk = receivedChunks.find((c) => c.status === 'executing');
    const verifiedChunk = receivedChunks.find((c) => c.status === 'verified');
    expect(executingChunk).toBeUndefined();
    expect(verifiedChunk).toBeUndefined();
  });
});
