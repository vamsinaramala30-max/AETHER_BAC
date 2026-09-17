/**
 * AETHER AI — Tools + Controlled Actions Comprehensive Test Suite
 * Validates all 20 required safety, authorization, validation, execution,
 * idempotency, retry, and multi-step dependency rules.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toolRegistry } from '../../modules/ai/tools/tool-registry.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { toolPermissions } from '../../modules/ai/tools/tool-permissions.js';
import { toolValidator } from '../../modules/ai/tools/tool-validator.js';
import { toolRouter } from '../../modules/ai/tools/tool-router.js';
import { planExecutor } from '../../modules/ai/planning/plan-executor.js';
import { confirmationManager } from '../../modules/ai/core/confirmation-manager.js';
import { planningEngine } from '../../modules/ai/planning/planning-engine.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
  AuthenticationContext,
} from '../../modules/ai/tools/tool-types.js';
import type { ActionPlan } from '../../modules/ai/planning/planning-types.js';

// Auto-register tools
import '../../modules/ai/tools/task-tools.js';
import '../../modules/ai/tools/project-tools.js';
import '../../modules/ai/tools/goal-tools.js';
import '../../modules/ai/tools/productivity-tools.js';
import '../../modules/ai/tools/automation-tools.js';
import '../../modules/ai/tools/workspace-tools.js';
import '../../modules/ai/tools/knowledge-tools.js';

describe('Prompt 24 — Tools + Controlled Actions', () => {
  const standardAuth: AuthenticationContext = {
    userId: 'a0000000-0000-0000-0000-000000000001',
    sessionId: 'sess_test_123',
    roles: ['user'],
    permissions: [
      'tasks:read',
      'tasks:write',
      'projects:read',
      'projects:write',
      'knowledge:read',
      'knowledge:write',
      'workspace:read',
    ],
    workspaceId: 'w0000000-0000-0000-0000-000000000001',
    userWorkspaceIds: [
      'w0000000-0000-0000-0000-000000000001',
      'w0000000-0000-0000-0000-000000000002',
    ],
  };

  const restrictedAuth: AuthenticationContext = {
    userId: 'c0000000-0000-0000-0000-000000000003',
    sessionId: 'sess_restricted_456',
    roles: ['guest'],
    permissions: ['tasks:read'],
    workspaceId: 'w0000000-0000-0000-0000-000000000003',
    userWorkspaceIds: ['w0000000-0000-0000-0000-000000000003'],
  };

  const dummyContext: ToolExecutionContext = {
    auth: standardAuth,
    traceId: 'trace_test_001',
    conversationId: 'conv_test_001',
    requestId: 'req_test_001',
  };

  beforeEach(() => {
    toolExecutor.clearIdempotencyCache();
    planExecutor.clearIdempotencyCache();
  });

  // ─── 1. Valid Tool Selection ───────────────────────────────────────────────
  it('1. Valid tool selection: resolves registered tool from registry', () => {
    const tool = toolRegistry.get('list_tasks');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('list_tasks');
    expect(tool?.category).toBe('tasks');

    const routed = toolRouter.route('list_tasks');
    expect(routed).toBeDefined();
    expect(routed?.name).toBe('list_tasks');
  });

  // ─── 2. Invalid Tool Selection ─────────────────────────────────────────────
  it('2. Invalid tool selection: returns TOOL_NOT_FOUND and does not throw or execute', async () => {
    const routed = toolRouter.route('fabricated_ghost_tool_999');
    expect(routed).toBeUndefined();

    const res = await toolExecutor.execute('fabricated_ghost_tool_999', {}, dummyContext);
    expect(res.success).toBe(false);
    expect(res.code).toBe('TOOL_NOT_FOUND');
    expect(res.error).toContain('not found in registry');
  });

  // ─── 3. Valid Arguments ────────────────────────────────────────────────────
  it('3. Valid arguments: validates correctly against schema without errors', () => {
    const tool = toolRegistry.get('create_task');
    expect(tool).toBeDefined();

    const validInput = {
      title: 'Review quarterly architecture design',
      priority: 'high',
      description: 'Detailed analysis of sub-engines',
    };

    const validation = toolValidator.validate(validInput, tool!.inputSchema);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  // ─── 4. Invalid Arguments ──────────────────────────────────────────────────
  it('4. Invalid arguments: rejects missing required fields and bad types with INVALID_INPUT', async () => {
    const tool = toolRegistry.get('create_task');
    expect(tool).toBeDefined();

    // Missing 'title'
    const invalidInput = { priority: 'invalid_priority_level' };
    const validation = toolValidator.validate(invalidInput, tool!.inputSchema);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Missing required field: "title"'))).toBe(true);
    expect(validation.errors.some((e) => e.includes('priority'))).toBe(true);

    const execRes = await toolExecutor.execute('create_task', invalidInput, dummyContext);
    expect(execRes.success).toBe(false);
    expect(execRes.code).toBe('INVALID_INPUT');
    expect(execRes.error).toContain('Invalid input');
  });

  // ─── 5. Unauthorized Action ────────────────────────────────────────────────
  it('5. Unauthorized action: denies execution when user lacks required permissions', async () => {
    const unauthContext: ToolExecutionContext = {
      auth: restrictedAuth, // Only has 'tasks:read'
      traceId: 'trace_unauth',
    };

    // 'create_task' requires 'tasks:write'
    const res = await toolExecutor.execute(
      'create_task',
      { title: 'Unauthorized Task Creation' },
      unauthContext,
    );

    expect(res.success).toBe(false);
    expect(res.code).toBe('FORBIDDEN');
    expect(res.error).toContain('Unauthorized');
  });

  // ─── 6. User Isolation ─────────────────────────────────────────────────────
  it('6. User isolation: prevents access to resources owned by other users without admin rights', () => {
    const userA = 'user_aaa';
    const userB = 'user_bbb';

    // Normal user cannot access another user's private resource
    const canAccessOther = toolPermissions.checkResourceAccess(userB, userA, ['user']);
    expect(canAccessOther).toBe(false);

    // Own resource access is allowed
    const canAccessOwn = toolPermissions.checkResourceAccess(userA, userA, ['user']);
    expect(canAccessOwn).toBe(true);

    // Admin can access
    const adminCanAccess = toolPermissions.checkResourceAccess(userB, userA, ['admin']);
    expect(adminCanAccess).toBe(true);
  });

  // ─── 7. Workspace Isolation ────────────────────────────────────────────────
  it('7. Workspace isolation: prevents cross-tenant access to unauthorized workspaces', () => {
    const targetWorkspace = 'ws_secret_corp';
    const userAllowedWorkspaces = ['ws_alpha', 'ws_beta'];

    const allowed = toolPermissions.checkWorkspaceAccess(
      targetWorkspace,
      'ws_alpha',
      userAllowedWorkspaces,
      ['user'],
    );
    expect(allowed).toBe(false);

    const allowedSelf = toolPermissions.checkWorkspaceAccess(
      'ws_alpha',
      'ws_alpha',
      userAllowedWorkspaces,
      ['user'],
    );
    expect(allowedSelf).toBe(true);
  });

  // ─── 8. Read Operation ─────────────────────────────────────────────────────
  it('8. Read operation: lists tasks without performing any side-effect writes', async () => {
    const res = await toolExecutor.execute('list_tasks', { limit: 5 }, dummyContext);
    expect(res.code).toBe('SUCCESS');
    expect(res.success).toBe(true);
    expect(res.riskLevel).toBe('READ_ONLY');
    expect(Array.isArray((res.data as any).tasks)).toBe(true);
  });

  // ─── 9. Write Operation ────────────────────────────────────────────────────
  it('9. Write operation: creates a task, executes database save and verifies result', async () => {
    const taskTitle = `Verified Action Task ${Date.now()}`;
    const res = await toolExecutor.execute(
      'create_task',
      { title: taskTitle, priority: 'medium' },
      dummyContext,
    );

    expect(res.success).toBe(true);
    expect(res.code).toBe('SUCCESS');
    expect(res.verified).toBe(true);
    expect(res.riskLevel).toBe('LOW_RISK');
    expect((res.data as any).title).toBe(taskTitle);
  });

  // ─── 10. Confirmation-Required Action ──────────────────────────────────────
  it('10. Confirmation-required action: flags destructive delete operations as HIGH_IMPACT requiring confirmation', () => {
    const deleteProjectTool = toolRegistry.get('delete_project');
    expect(deleteProjectTool).toBeDefined();
    expect(deleteProjectTool?.riskLevel).toBe('HIGH_IMPACT');
    expect(deleteProjectTool?.requiresConfirmation).toBe(true);

    const requiresConf = confirmationManager.requiresConfirmation('delete_project', {
      projectId: 'proj_123',
    });
    expect(requiresConf).toBe(true);

    const confReq = confirmationManager.createConfirmationRequest('delete_project', {
      projectId: 'proj_123',
    });
    expect(confReq.toolName).toBe('delete_project');
    expect(confReq.description).toContain('delete_project');
    expect(confReq.riskLevel).toBe('DESTRUCTIVE');
  });

  // ─── 11. Confirmation Denied / Unconfirmed ─────────────────────────────────
  it('11. Confirmation denied / unconfirmed: PlanExecutor halts execution of unconfirmed destructive steps', async () => {
    const planWithDestructiveAction: ActionPlan = {
      planId: 'plan_destructive_1',
      objective: 'Delete obsolete project',
      steps: [
        {
          stepId: 'step_del_1',
          stepNumber: 1,
          description: 'Delete project proj_target_99',
          toolName: 'delete_project',
          toolInput: { projectId: 'proj_target_99' },
          riskLevel: 'HIGH_IMPACT',
          requiresConfirmation: true,
          status: 'pending',
          verified: false,
        },
      ],
      totalSteps: 1,
      executionMode: 'direct',
      requiresConfirmation: true,
      createdAt: new Date().toISOString(),
    };

    // Execute without confirmation
    const planRes = await planExecutor.executePlan(planWithDestructiveAction, dummyContext, {
      confirmedActionIds: [], // Not confirmed
    });

    expect(planRes.status).toBe('FAILED');
    expect(planRes.steps[0].status).toBe('failed');
    expect(planRes.steps[0].error).toContain('requires explicit user confirmation');
  });

  // ─── 12. Tool Success & Real Verification ──────────────────────────────────
  it('12. Tool success & verification: executes real repository and passes verify() check', async () => {
    const res = await toolExecutor.execute(
      'create_project',
      { name: `Verified Project ${Date.now()}` },
      dummyContext,
    );

    expect(res.success).toBe(true);
    expect(res.verified).toBe(true);
    expect(res.verificationDetails).toContain('verified in database');
  });

  // ─── 13. Tool Failure Handling ─────────────────────────────────────────────
  it('13. Tool failure handling: returns TOOL_EXECUTION_FAILED and never claims done when backend throws', async () => {
    // Attempting to update a non-existent task ID
    const res = await toolExecutor.execute(
      'update_task',
      { taskId: '00000000-0000-0000-0000-000000000000', title: 'New Title' },
      dummyContext,
    );

    expect(res.success).toBe(false);
    expect(res.code).toBe('TOOL_EXECUTION_FAILED');
    expect(res.error).toContain('not found');
  });

  // ─── 14. Timeout Handling ──────────────────────────────────────────────────
  it('14. Timeout handling: enforces tool execution timeout and returns TIMEOUT', async () => {
    // Register temporary slow tool
    const slowTool: ToolDefinition<Record<string, unknown>, { done: boolean }> = {
      name: 'slow_test_tool',
      description: 'Slow hanging tool for timeout test',
      category: 'system',
      inputSchema: { type: 'object', properties: {} },
      requiredPermissions: [],
      timeoutMs: 50, // 50ms timeout
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { done: true };
      },
    };

    if (!toolRegistry.has('slow_test_tool')) {
      toolRegistry.register(slowTool);
    }

    const res = await toolExecutor.execute('slow_test_tool', {}, dummyContext, { timeoutMs: 50 });
    expect(res.success).toBe(false);
    expect(res.code).toBe('TIMEOUT');
    expect(res.error).toContain('timed out');
  });

  // ─── 15. Cancellation Handling ─────────────────────────────────────────────
  it('15. Cancellation handling: responds to AbortSignal and aborts execution safely', async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-aborted

    const cancelledContext: ToolExecutionContext = {
      ...dummyContext,
      signal: controller.signal,
    };

    const res = await toolExecutor.execute('list_tasks', {}, cancelledContext);
    expect(res.success).toBe(false);
    expect(res.code).toBe('CANCELLED');
  });

  // ─── 16. Safe Retry Policy ─────────────────────────────────────────────────
  it('16. Safe retry policy: allows retries on read-only tools, but forbids auto-retrying write operations', async () => {
    let readAttempts = 0;
    let writeAttempts = 0;

    const flakyReadTool: ToolDefinition<Record<string, unknown>, { count: number }> = {
      name: 'flaky_read_tool',
      description: 'Flaky read tool',
      category: 'system',
      riskLevel: 'READ_ONLY',
      retryable: true,
      inputSchema: { type: 'object', properties: {} },
      requiredPermissions: [],
      handler: async () => {
        readAttempts++;
        if (readAttempts === 1) throw new Error('Transient network glitch');
        return { count: readAttempts };
      },
    };

    const failingWriteTool: ToolDefinition<Record<string, unknown>, { done: boolean }> = {
      name: 'failing_write_tool',
      description: 'Failing write tool',
      category: 'system',
      riskLevel: 'LOW_RISK', // Write operation
      inputSchema: { type: 'object', properties: {} },
      requiredPermissions: [],
      handler: async () => {
        writeAttempts++;
        throw new Error('Write error');
      },
    };

    if (!toolRegistry.has('flaky_read_tool')) toolRegistry.register(flakyReadTool);
    if (!toolRegistry.has('failing_write_tool')) toolRegistry.register(failingWriteTool);

    // Read tool retries and succeeds on attempt 2
    const readRes = await toolExecutor.execute('flaky_read_tool', {}, dummyContext, {
      maxRetries: 2,
    });
    expect(readRes.success).toBe(true);
    expect(readAttempts).toBe(2);

    // Write tool is NOT retried automatically to prevent duplicate side effects
    const writeRes = await toolExecutor.execute('failing_write_tool', {}, dummyContext, {
      maxRetries: 2,
    });
    expect(writeRes.success).toBe(false);
    expect(writeAttempts).toBe(1); // Only 1 attempt!
  });

  // ─── 17. Duplicate Execution Prevention / Idempotency ──────────────────────
  it('17. Duplicate execution prevention: returns cached result for identical idempotencyKey', async () => {
    let invocationCount = 0;

    const countedTool: ToolDefinition<Record<string, unknown>, { count: number }> = {
      name: 'counted_idempotent_tool',
      description: 'Tool to test idempotency caching',
      category: 'system',
      riskLevel: 'LOW_RISK',
      inputSchema: { type: 'object', properties: {} },
      requiredPermissions: [],
      handler: async () => {
        invocationCount++;
        return { count: invocationCount };
      },
    };

    if (!toolRegistry.has('counted_idempotent_tool')) toolRegistry.register(countedTool);

    const idempotencyKey = `idem_key_${Date.now()}`;

    // First call
    const res1 = await toolExecutor.execute('counted_idempotent_tool', {}, dummyContext, {
      idempotencyKey,
    });
    expect(res1.success).toBe(true);
    expect(invocationCount).toBe(1);

    // Second call with same key returns cached result without re-executing handler
    const res2 = await toolExecutor.execute('counted_idempotent_tool', {}, dummyContext, {
      idempotencyKey,
    });
    expect(res2.success).toBe(true);
    expect(res2.cached).toBe(true);
    expect(invocationCount).toBe(1); // Handler was not run twice!
  });

  // ─── 18. Multi-Step Tool Dependency ────────────────────────────────────────
  it('18. Multi-step tool dependency: skips dependent step if prerequisite step fails', async () => {
    const multiStepPlan: ActionPlan = {
      planId: 'plan_dep_test',
      objective: 'Multi-step dependency failure test',
      steps: [
        {
          stepId: 'step_1',
          stepNumber: 1,
          description: 'Step 1 that fails',
          toolName: 'update_task',
          toolInput: { taskId: '00000000-0000-0000-0000-000000000000' }, // Invalid ID will fail
          riskLevel: 'LOW_RISK',
          status: 'pending',
          verified: false,
        },
        {
          stepId: 'step_2',
          stepNumber: 2,
          description: 'Step 2 depending on Step 1',
          toolName: 'list_tasks',
          toolInput: {},
          dependencies: ['step_1'],
          riskLevel: 'READ_ONLY',
          status: 'pending',
          verified: false,
        },
      ],
      totalSteps: 2,
      executionMode: 'sequential',
      requiresConfirmation: false,
      createdAt: new Date().toISOString(),
    };

    const result = await planExecutor.executePlan(multiStepPlan, dummyContext);

    expect(result.status).toBe('FAILED');
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[1].status).toBe('failed');
    expect(result.steps[1].error).toContain('prerequisite dependency step failed');
  });

  // ─── 19. Missing Tool Handling ─────────────────────────────────────────────
  it('19. Missing tool handling: validates plan checks missing tool and rejects execution', () => {
    const planWithMissingTool: ActionPlan = {
      planId: 'plan_missing_tool',
      objective: 'Objective with unregistered tool',
      steps: [
        {
          stepId: 'step_missing_1',
          stepNumber: 1,
          description: 'Run non-existent capability',
          toolName: 'unregistered_magical_teleport_tool',
          toolInput: {},
          riskLevel: 'LOW_RISK',
          status: 'pending',
          verified: false,
        },
      ],
      totalSteps: 1,
      executionMode: 'direct',
      requiresConfirmation: false,
      createdAt: new Date().toISOString(),
    };

    const validation = planningEngine.validatePlan(planWithMissingTool, standardAuth);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('not available in the registry'))).toBe(true);
  });

  // ─── 20. Tool Discovery & Filtering ────────────────────────────────────────
  it('20. Tool discovery & filtering: returns accessible tools matching search query without leaking handlers', () => {
    const allTools = toolRegistry.list();
    expect(allTools.length).toBeGreaterThan(10);
    // Ensure no descriptors leak handlers
    for (const descriptor of allTools) {
      expect((descriptor as any).handler).toBeUndefined();
      expect(descriptor.name).toBeDefined();
      expect(descriptor.inputSchema).toBeDefined();
    }

    const taskTools = toolRouter.discoverTools('task', standardAuth);
    expect(taskTools.length).toBeGreaterThan(0);
    expect(
      taskTools.every(
        (t) =>
          t.category === 'tasks' ||
          t.name.includes('task') ||
          (t.description && t.description.toLowerCase().includes('task')),
      ),
    ).toBe(true);
  });
});
