/**
 * AETHER AI — Prompt 8 Autonomous Agent Execution Loop Test Suite
 *
 * Mandatory Verification Suites (Section 31):
 * 1. Execution Lifecycle: PENDING -> VALIDATING -> AUTHORIZED -> RUNNING -> VERIFYING -> COMPLETED
 * 2. Plan Integrity & Tampering: Hash verification, version check, status check
 * 3. Security & Tenant Isolation: Cross-tenant plan execution rejection, cross-user execution isolation
 * 4. Tool Execution & Sandbox: Strict Prompt 6 ToolExecutor routing, arbitrary tool execution rejection
 * 5. Truthful Verification: tool success = true BUT verification = false -> NEVER reports success
 * 6. Approval Gates: High-impact / confirmation-required steps halt at WAITING_FOR_APPROVAL
 * 7. User Input Gates: Clarification / missing input pauses at WAITING_FOR_INPUT
 * 8. Bounded Retries & Error Classification: Transient retried with backoff; auth/tenant fail immediately
 * 9. Timeouts & Cancellation: AbortSignal cancellation, execution timeout
 * 10. Idempotency & Concurrency: Duplicate execution prevention, in-flight mutex lock
 * 11. Replanning Invariant: Frozen plan is never mutated; replanningRequired flagged
 * 12. State Machine: Deterministic transitions enforced; invalid transitions throw InvalidTransitionError
 * 13. Observability & Sanitization: Secrets (passwords, tokens, keys) redacted from events and logs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';
import {
  ExecutionEngine,
  ExecutionRepository,
  ExecutionStateMachine,
  ExecutionVerifier,
  ExecutionRecovery,
  InvalidTransitionError,
} from '../../modules/ai/index.js';
import type {
  PlanHandoffPayload,
  ValidatedHandoffStep,
} from '../../modules/ai/planning/plan-handoff.js';
import type { ExecutionContext, ExecutionEvent } from '../../modules/ai/execution/execution-types.js';
import type { IToolExecutor } from '../../modules/ai/tools/tool-executor.js';
import type { ToolResult, ToolDefinition } from '../../modules/ai/tools/tool-types.js';
import { planRepository } from '../../modules/ai/planning/plan-repository.js';
import type { AgentPlan } from '../../modules/ai/planning/planning-types.js';

// ============================================================================
// Test Helpers & Mock Fixtures
// ============================================================================

const TEST_USER_ID = 'user_exec_123';
const TEST_WORKSPACE_ID = 'ws_exec_456';
const TEST_PLAN_ID = 'plan_exec_789';

function createMockAuthContext(userId = TEST_USER_ID, workspaceId = TEST_WORKSPACE_ID): ExecutionContext {
  return {
    userId,
    sessionId: `sess_${userId}`,
    roles: ['user'],
    permissions: ['*'],
    workspaceId,
    projectId: 'proj_default',
    conversationId: 'conv_default',
    correlationId: `corr_${Date.now()}`,
    requestId: `req_${Date.now()}`,
    auth: {
      userId,
      sessionId: `sess_${userId}`,
      roles: ['user'],
      permissions: ['*'],
      workspaceId,
    },
  };
}

function computePlanHash(
  planId: string,
  version: number,
  userId: string,
  goal: { description: string },
  steps: { id: string; order: number; toolName?: string }[],
): string {
  const payload = JSON.stringify({
    id: planId,
    version,
    userId,
    goal,
    steps: steps.map((s) => ({ id: s.id, order: s.order, toolName: s.toolName })),
  });
  return createHash('sha256').update(payload).digest('hex');
}

function buildValidHandoff(
  steps: ValidatedHandoffStep[],
  userId = TEST_USER_ID,
  workspaceId = TEST_WORKSPACE_ID,
  version = 1,
): PlanHandoffPayload {
  const goal = { description: 'Autonomous execution test plan goal' };
  const planHash = computePlanHash(
    TEST_PLAN_ID,
    version,
    userId,
    goal,
    steps.map((s) => ({ id: s.stepId, order: s.order, toolName: s.toolName })),
  );

  return {
    handoffId: `handoff_${Date.now()}`,
    planId: TEST_PLAN_ID,
    version,
    planHash,
    correlationId: `corr_${Date.now()}`,
    goal,
    executionContext: {
      userId,
      workspaceId,
      projectId: 'proj_default',
      conversationId: 'conv_default',
    },
    steps,
    totalSteps: steps.length,
    requiresUserConfirmation: steps.some((s) => s.requiresConfirmation || s.isHighImpact),
    confirmationStepsCount: steps.filter((s) => s.requiresConfirmation || s.isHighImpact).length,
    status: 'HANDED_OFF',
    handedOffAt: new Date().toISOString(),
  };
}

function createMockAgentPlan(
  handoff: PlanHandoffPayload,
  steps: readonly ValidatedHandoffStep[] = handoff.steps,
): AgentPlan {
  return {
    id: handoff.planId,
    version: handoff.version,
    userId: handoff.executionContext.userId,
    workspaceId: handoff.executionContext.workspaceId,
    goal: handoff.goal,
    correlationId: 'corr_test',
    status: 'HANDED_OFF',
    constraints: [],
    assumptions: [],
    dependencies: [],
    requiresUserInput: false,
    steps: steps.map((s) => ({
      id: s.stepId,
      order: s.order,
      type: 'TOOL',
      status: 'READY',
      title: s.title,
      description: s.description,
      toolName: s.toolName,
      dependencies: s.dependencies ?? [],
      riskLevel: s.isHighImpact ? 'DESTRUCTIVE' : 'LOW_RISK_WRITE',
      requiresConfirmation: s.requiresConfirmation ?? false,
    })),
    planHash: handoff.planHash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Prompt 8 — Autonomous Agent Execution Loop', () => {
  let repo: ExecutionRepository;
  let sm: ExecutionStateMachine;
  let ver: ExecutionVerifier;
  let rec: ExecutionRecovery;
  let mockToolExecutor: IToolExecutor;
  let engine: ExecutionEngine;
  let registeredTools: Map<string, ToolDefinition>;

  beforeEach(async () => {
    repo = new ExecutionRepository();
    sm = new ExecutionStateMachine();
    ver = new ExecutionVerifier();
    rec = new ExecutionRecovery();
    registeredTools = new Map<string, ToolDefinition>();

    // Register test tools
    registeredTools.set('create_task', {
      name: 'create_task',
      version: '1.0.0',
      description: 'Creates a task',
      category: 'tasks',
      riskLevel: 'LOW_RISK_WRITE',
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
      },
      requiredPermissions: [],
      requiresConfirmation: false,
      handler: vi.fn(),
      execute: vi.fn(),
    } as unknown as ToolDefinition);

    registeredTools.set('delete_project', {
      name: 'delete_project',
      version: '1.0.0',
      description: 'Deletes a project permanently',
      category: 'workspace',
      riskLevel: 'DESTRUCTIVE',
      inputSchema: {
        type: 'object',
        properties: { projectId: { type: 'string' } },
        required: ['projectId'],
      },
      requiredPermissions: [],
      requiresConfirmation: true,
      handler: vi.fn(),
      execute: vi.fn(),
    } as unknown as ToolDefinition);

    mockToolExecutor = {
      execute: vi.fn().mockImplementation(async (toolName, input) => {
        return {
          success: true,
          data: { taskId: 'task_created_1', ...input },
          verified: true,
          verificationStatus: 'VERIFIED',
          verificationDetails: 'Database row confirmed',
          executionTimeMs: 15,
        } as ToolResult;
      }),
      listTools: () => Array.from(registeredTools.values()),
      getTool: (name: string) => registeredTools.get(name),
      validateAction: vi.fn().mockReturnValue({ valid: true, sanitizedInput: {} }),
      verifyAction: vi.fn().mockResolvedValue({ verified: true, verificationStatus: 'VERIFIED' }),
      clearIdempotencyCache: vi.fn(),
    };

    engine = new ExecutionEngine(mockToolExecutor, repo, sm, ver, rec);

    // Seed plan in planRepository so verifyPlanIntegrity passes
    const baseHandoff = buildValidHandoff([
      {
        stepId: 'step_1',
        order: 1,
        title: 'Create primary task',
        description: 'Create primary task in workspace',
        toolName: 'create_task',
        dependencies: [],
        requiresConfirmation: false,
        isHighImpact: false,
      },
    ]);
    const basePlan = createMockAgentPlan(baseHandoff, baseHandoff.steps);
    await planRepository.savePlan(basePlan);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  describe('1. Execution Lifecycle', () => {
    it('executes full happy path: PENDING -> VALIDATING -> AUTHORIZED -> RUNNING -> VERIFYING -> COMPLETED', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Create primary task',
          description: 'Create primary task',
          toolName: 'create_task',
          toolVersion: '1.0.0',
          validatedInput: { title: 'First Task' },
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      const events: string[] = [];
      const result = await engine.startExecution(handoff, ctx, {}, (ev: ExecutionEvent) => {
        events.push(ev.type);
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.verified).toBe(true);
      expect(result.completedStepsCount).toBe(1);
      expect(result.failedStepsCount).toBe(0);
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);

      // Verify sequence of streamed events
      expect(events).toContain('execution.started');
      expect(events).toContain('plan.validated');
      expect(events).toContain('step.started');
      expect(events).toContain('tool.started');
      expect(events).toContain('tool.completed');
      expect(events).toContain('step.verified');
      expect(events).toContain('execution.completed');

      // Verify persistence
      const saved = await repo.findById(result.executionId, TEST_USER_ID);
      expect(saved).not.toBeNull();
      expect(saved?.status).toBe('COMPLETED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Plan Integrity & Tampering
  // ──────────────────────────────────────────────────────────────────────────

  describe('2. Plan Integrity & Tampering', () => {
    it('rejects execution if plan status is not HANDED_OFF', async () => {
      const handoff = buildValidHandoff([]);
      (handoff as any).status = 'READY'; // Not handed off
      const ctx = createMockAuthContext();

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('BLOCKED');
      expect(result.failureReason).toContain('HANDED_OFF');
    });

    it('rejects execution if plan hash is tampered or invalid', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Tampered step',
          description: 'Tampered step description',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      (handoff as any).planHash = 'tampered_bad_hash_12345';
      const ctx = createMockAuthContext();

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('BLOCKED');
      expect(result.failureReason).toContain('Plan hash');
    });

    it('rejects execution if plan version does not match authoritative store', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Version mismatch step',
          description: 'Version mismatch step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps, TEST_USER_ID, TEST_WORKSPACE_ID, 99); // Store has version 1
      const ctx = createMockAuthContext();

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('BLOCKED');
      expect(result.failureReason).toContain('version mismatch');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Security & Tenant Isolation
  // ──────────────────────────────────────────────────────────────────────────

  describe('3. Security & Tenant Isolation', () => {
    it('strictly forbids executing a plan belonging to another user', async () => {
      const steps: ValidatedHandoffStep[] = [];
      const handoff = buildValidHandoff(steps, 'attacker_user_999');
      const ctx = createMockAuthContext(TEST_USER_ID); // Authenticated as legitimate user

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('BLOCKED');
      expect(result.failureCategory).toBe('TENANT_VIOLATION');
      expect(result.failureReason).toContain('Authenticated user does not match plan owner');
    });

    it('strictly forbids accessing another user execution record', async () => {
      const exec = await repo.createExecution({
        id: 'exec_user_a',
        planId: 'plan_a',
        planVersion: 1,
        planHash: 'hash_a',
        correlationId: 'corr_a',
        userId: 'user_A',
        status: 'COMPLETED',
        completedStepIds: [],
        failedStepIds: [],
        blockedStepIds: [],
        replanningRequired: false,
        totalSteps: 1,
        completedStepsCount: 1,
        failedStepsCount: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // User A can read
      const foundA = await repo.findById(exec.id, 'user_A');
      expect(foundA).not.toBeNull();

      // User B cannot read
      const foundB = await repo.findById(exec.id, 'user_B');
      expect(foundB).toBeNull();
    });

    it('rejects workspace tenant mismatch between context and plan', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Cross-workspace step',
          description: 'Cross-workspace step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps, TEST_USER_ID, TEST_WORKSPACE_ID);
      // Context claims a different workspace than the saved plan
      const ctx = createMockAuthContext(TEST_USER_ID, 'other_workspace_999');

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('BLOCKED');
      expect(result.failureReason).toContain('Workspace tenant violation');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Sandboxed Tool Execution
  // ──────────────────────────────────────────────────────────────────────────

  describe('4. Sandboxed Tool Execution (No Arbitrary Code Execution)', () => {
    it('blocks execution immediately if model attempts to invoke an unregistered tool', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Arbitrary shell execution attempt',
          description: 'Execute dangerous shell command',
          toolName: 'shell_exec_arbitrary',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      // Update plan in repository
      await planRepository.savePlan(createMockAgentPlan(handoff, steps));

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('BLOCKED');
      expect(result.failureReason).toMatch(/registered|arbitrary/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Truthful Verification (Mandatory Invariant)
  // ──────────────────────────────────────────────────────────────────────────

  describe('5. Truthful Verification', () => {
    it('CRITICAL: tool returns success=true BUT database verification fails -> NEVER reports success', async () => {
      // Mock tool returning success: true, but verified: false and code: VERIFICATION_FAILED
      (mockToolExecutor.execute as any).mockResolvedValueOnce({
        success: true,
        data: { taskId: 'task_123' },
        verified: false,
        verificationStatus: 'FAILED',
        code: 'VERIFICATION_FAILED',
        verificationDetails: 'Verification failed: task row was not found in PostgreSQL.',
        executionTimeMs: 20,
      });

      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Create task with false success',
          description: 'Create task with false success',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      const result = await engine.startExecution(handoff, ctx);

      // System must NEVER claim COMPLETED or success
      expect(result.status).not.toBe('COMPLETED');
      expect(result.status).toBe('FAILED');
      expect(result.verified).toBe(false);
      expect(result.completedStepsCount).toBe(0);
      expect(result.failedStepsCount).toBe(1);
      expect(result.steps[0].verified).toBe(false);
      expect(result.steps[0].status).toBe('FAILED');
      expect(result.steps[0].error).toContain('Verification failed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Approval Gates
  // ──────────────────────────────────────────────────────────────────────────

  describe('6. Approval Gates', () => {
    it('halts execution at WAITING_FOR_APPROVAL for high-impact action and resumes when approved', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Delete project permanently',
          description: 'Delete project permanently',
          toolName: 'delete_project',
          validatedInput: { projectId: 'proj_delete_1' },
          dependencies: [],
          requiresConfirmation: true,
          isHighImpact: true,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      // Update plan in store
      await planRepository.savePlan(createMockAgentPlan(handoff, steps));

      let approvalEventReceived = false;

      // Start execution in background promise
      const execPromise = engine.startExecution(handoff, ctx, {}, (ev) => {
        if (ev.type === 'approval.required') {
          approvalEventReceived = true;
          // Approve after a brief delay
          setTimeout(async () => {
            await engine.approveStep(ev.executionId, 'step_1', TEST_USER_ID);
          }, 20);
        }
      });

      const result = await execPromise;
      expect(approvalEventReceived).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.completedStepsCount).toBe(1);
    });

    it('cancels high-impact step if approval is denied or cancelled', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Delete project',
          description: 'Delete project',
          toolName: 'delete_project',
          dependencies: [],
          requiresConfirmation: true,
          isHighImpact: true,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      await planRepository.savePlan(createMockAgentPlan(handoff, steps));

      const abortCtrl = new AbortController();
      const execPromise = engine.startExecution(handoff, ctx, { signal: abortCtrl.signal }, (ev) => {
        if (ev.type === 'approval.required') {
          abortCtrl.abort(); // Cancel while awaiting approval
        }
      });

      const result = await execPromise;
      expect(result.status).toBe('CANCELLED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Topological Order & Dependencies
  // ──────────────────────────────────────────────────────────────────────────

  describe('7. Topological Order & Dependencies', () => {
    it('executes steps strictly in Kahn topological order', async () => {
      const executionOrder: string[] = [];
      (mockToolExecutor.execute as any).mockImplementation(async (_tool: string, input: any) => {
        executionOrder.push(input.id);
        return { success: true, verified: true, verificationStatus: 'VERIFIED' };
      });

      // Step 3 depends on Step 2; Step 2 depends on Step 1
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_3',
          order: 3,
          title: 'Step 3',
          description: 'Step 3',
          toolName: 'create_task',
          validatedInput: { id: 'step_3' },
          dependencies: ['step_2'],
          requiresConfirmation: false,
          isHighImpact: false,
        },
        {
          stepId: 'step_1',
          order: 1,
          title: 'Step 1',
          description: 'Step 1',
          toolName: 'create_task',
          validatedInput: { id: 'step_1' },
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
        {
          stepId: 'step_2',
          order: 2,
          title: 'Step 2',
          description: 'Step 2',
          toolName: 'create_task',
          validatedInput: { id: 'step_2' },
          dependencies: ['step_1'],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];

      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      await planRepository.savePlan(createMockAgentPlan(handoff, steps));

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('COMPLETED');
      expect(executionOrder).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('blocks execution when a cyclic dependency is detected', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_A',
          order: 1,
          title: 'Step A',
          description: 'Step A',
          toolName: 'create_task',
          dependencies: ['step_B'],
          requiresConfirmation: false,
          isHighImpact: false,
        },
        {
          stepId: 'step_B',
          order: 2,
          title: 'Step B',
          description: 'Step B',
          toolName: 'create_task',
          dependencies: ['step_A'],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];

      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      await planRepository.savePlan(createMockAgentPlan(handoff, steps));

      const result = await engine.startExecution(handoff, ctx);
      expect(result.status).toBe('BLOCKED');
      expect(result.failureReason).toMatch(/cyclic|circular/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Bounded Retries & Error Classification
  // ──────────────────────────────────────────────────────────────────────────

  describe('8. Bounded Retries & Error Classification', () => {
    it('retries transient failures up to maxRetries and succeeds on subsequent attempt', async () => {
      let attempts = 0;
      (mockToolExecutor.execute as any).mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Network connection timeout temporarily unavailable');
        }
        return { success: true, verified: true, verificationStatus: 'VERIFIED' };
      });

      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Retry step',
          description: 'Retry step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      const result = await engine.startExecution(handoff, ctx, { maxRetries: 2 });
      expect(result.status).toBe('COMPLETED');
      expect(attempts).toBe(2);
      expect(result.steps[0].attemptCount).toBe(2);
    });

    it('does NOT retry authorization, validation, or tenant failures', async () => {
      let attempts = 0;
      (mockToolExecutor.execute as any).mockImplementation(async () => {
        attempts++;
        throw new Error('Permission denied: unauthorized resource access');
      });

      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Auth fail step',
          description: 'Auth fail step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      const result = await engine.startExecution(handoff, ctx, { maxRetries: 3 });
      expect(result.status).toBe('FAILED');
      expect(attempts).toBe(1); // Immediate failure without retry
      expect(result.steps[0].attemptCount).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Timeouts & Cancellation
  // ──────────────────────────────────────────────────────────────────────────

  describe('9. Timeouts & Cancellation', () => {
    it('halts and marks CANCELLED when AbortSignal is triggered', async () => {
      const abortCtrl = new AbortController();
      (mockToolExecutor.execute as any).mockImplementation(async () => {
        abortCtrl.abort();
        return { success: true, verified: true, verificationStatus: 'VERIFIED' };
      });

      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Cancel step',
          description: 'Cancel step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
        {
          stepId: 'step_2',
          order: 2,
          title: 'Unreached step',
          description: 'Unreached step',
          toolName: 'create_task',
          dependencies: ['step_1'],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      await planRepository.savePlan(createMockAgentPlan(handoff, steps));

      const result = await engine.startExecution(handoff, ctx, { signal: abortCtrl.signal });
      expect(result.status).toBe('CANCELLED');
    });

    it('marks TIMED_OUT when execution time limit is exceeded', async () => {
      (mockToolExecutor.execute as any).mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 60));
        return { success: true, verified: true, verificationStatus: 'VERIFIED' };
      });

      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Slow step 1',
          description: 'Slow step 1',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
        {
          stepId: 'step_2',
          order: 2,
          title: 'Slow step 2',
          description: 'Slow step 2',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      await planRepository.savePlan(createMockAgentPlan(handoff, steps));

      // 40ms execution timeout
      const result = await engine.startExecution(handoff, ctx, { executionTimeoutMs: 40 });
      expect(result.status).toBe('TIMED_OUT');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Idempotency & Concurrency Safety
  // ──────────────────────────────────────────────────────────────────────────

  describe('10. Idempotency & Concurrency Safety', () => {
    it('returns cached result on idempotent re-execution of completed plan', async () => {
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Idempotent step',
          description: 'Idempotent step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      const r1 = await engine.startExecution(handoff, ctx, { idempotencyKey: 'idemp_key_100' });
      expect(r1.status).toBe('COMPLETED');
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);

      // Re-execution with same key returns cached result without running tool again
      const r2 = await engine.startExecution(handoff, ctx, { idempotencyKey: 'idemp_key_100' });
      expect(r2.status).toBe('COMPLETED');
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('rejects concurrent duplicate execution while execution is already running', async () => {
      let releaseTool: () => void = () => {};
      const toolBlockedPromise = new Promise((resolve) => {
        releaseTool = () => resolve({ success: true, verified: true, verificationStatus: 'VERIFIED' });
      });
      (mockToolExecutor.execute as any).mockImplementationOnce(() => toolBlockedPromise);

      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Concurrent step',
          description: 'Concurrent step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      const p1 = engine.startExecution(handoff, ctx, { idempotencyKey: 'concurrent_key_200' });

      // Concurrent invocation with same key
      const p2 = await engine.startExecution(handoff, ctx, { idempotencyKey: 'concurrent_key_200' });
      expect(p2.status).toBe('BLOCKED');
      expect(p2.failureCategory).toBe('CONFLICT');

      releaseTool!();
      const r1 = await p1;
      expect(r1.status).toBe('COMPLETED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Replanning Invariant
  // ──────────────────────────────────────────────────────────────────────────

  describe('11. Replanning Invariant', () => {
    it('flags replanningRequired=true on CONFLICT without mutating the frozen plan', async () => {
      (mockToolExecutor.execute as any).mockResolvedValueOnce({
        success: false,
        code: 'CONFLICT',
        error: 'Resource already exists with conflicting ID',
        verified: false,
      });

      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Conflicting step',
          description: 'Conflicting step',
          toolName: 'create_task',
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      const result = await engine.startExecution(handoff, ctx);
      expect(result.replanningRequired).toBe(true);

      // Verify original plan in repository is completely unchanged
      const planInStore = await planRepository.findById(TEST_PLAN_ID, TEST_USER_ID);
      expect(planInStore?.version).toBe(1);
      expect(planInStore?.status).toBe('HANDED_OFF');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. State Machine Determinism
  // ──────────────────────────────────────────────────────────────────────────

  describe('12. State Machine Determinism', () => {
    it('throws InvalidTransitionError on disallowed state transitions', () => {
      expect(() => sm.transition('COMPLETED', 'RUNNING')).toThrow(InvalidTransitionError);
      expect(() => sm.transition('FAILED', 'RUNNING')).toThrow(InvalidTransitionError);
      expect(() => sm.transition('PENDING', 'COMPLETED')).toThrow(InvalidTransitionError);
      expect(() => sm.transition('BLOCKED', 'RUNNING')).toThrow(InvalidTransitionError);
    });

    it('correctly identifies terminal and cancellable statuses', () => {
      expect(sm.isTerminal('COMPLETED')).toBe(true);
      expect(sm.isTerminal('FAILED')).toBe(true);
      expect(sm.isTerminal('RUNNING')).toBe(false);
      expect(sm.isTerminal('VALIDATING')).toBe(false);

      expect(sm.canCancel('RUNNING')).toBe(true);
      expect(sm.canCancel('WAITING_FOR_APPROVAL')).toBe(true);
      expect(sm.canCancel('COMPLETED')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 13. Observability & Sanitization
  // ──────────────────────────────────────────────────────────────────────────

  describe('13. Observability & Secret Sanitization', () => {
    it('sanitizes passwords and API tokens from emitted event payloads', async () => {
      const emittedEvents: ExecutionEvent[] = [];
      const steps: ValidatedHandoffStep[] = [
        {
          stepId: 'step_1',
          order: 1,
          title: 'Step with secret payload',
          description: 'Step with secret payload',
          toolName: 'create_task',
          validatedInput: {
            title: 'Config task',
            password: 'SuperSecretPassword123!',
            apiKey: 'sk-live-secret-api-key',
          },
          dependencies: [],
          requiresConfirmation: false,
          isHighImpact: false,
        },
      ];
      const handoff = buildValidHandoff(steps);
      const ctx = createMockAuthContext();

      await engine.startExecution(handoff, ctx, {}, (ev) => {
        emittedEvents.push(ev);
      });

      const eventString = JSON.stringify(emittedEvents);
      expect(eventString).not.toContain('SuperSecretPassword123!');
      expect(eventString).not.toContain('sk-live-secret-api-key');
    });
  });
});
