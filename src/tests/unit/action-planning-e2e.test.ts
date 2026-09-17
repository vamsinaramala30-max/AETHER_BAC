/**
 * AETHER AI — End-to-End Action, Planning, Tools, Tasks, Goals & Automation Tests
 * Tests all 8 mandatory Prompt 6 end-to-end scenarios + unit contracts.
 * Strictly uses real backend services, real database verification, and real permission enforcement.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { db } from '../../database/client.js';
import { toolRegistry } from '../../modules/ai/tools/tool-registry.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { toolPermissions } from '../../modules/ai/tools/tool-permissions.js';
import { toolValidator } from '../../modules/ai/tools/tool-validator.js';
import { planningEngine } from '../../modules/ai/planning/planning-engine.js';
import { planExecutor } from '../../modules/ai/planning/plan-executor.js';
import { actionAuditLogger } from '../../modules/ai/audit/action-audit-logger.js';
import { confirmationManager } from '../../modules/ai/core/confirmation-manager.js';
import { responseValidator } from '../../modules/ai/core/response-validator.js';
import { TasksRepository } from '../../modules/projects/tasks/tasks.repository.js';
import { ProjectsRepository } from '../../modules/projects/projects.repository.js';
import { GoalsRepository } from '../../modules/projects/goals/goals.repository.js';
import { AutomationService } from '../../modules/automation/automation.service.js';
import { TaskStatus } from '../../modules/projects/projects.constants.js';
import type { AuthenticationContext } from '../../modules/ai/tools/tool-types.js';

const tasksRepo = new TasksRepository();
const projectsRepo = new ProjectsRepository();
const goalsRepo = new GoalsRepository();
const automationService = new AutomationService();

const userA: AuthenticationContext = {
  userId: 'a0000000-0000-0000-0000-000000000001',
  sessionId: 'sess_user_a',
  roles: ['user'],
  permissions: [
    'tasks:read',
    'tasks:write',
    'projects:read',
    'projects:write',
    'goals:read',
    'goals:write',
    'automation:read',
    'automation:write',
    'automation:execute',
    'workspace:read',
  ],
};

const userB: AuthenticationContext = {
  userId: 'b0000000-0000-0000-0000-000000000002',
  sessionId: 'sess_user_b',
  roles: ['user'],
  permissions: ['tasks:read', 'tasks:write'],
};

const unprivilegedUser: AuthenticationContext = {
  userId: 'c0000000-0000-0000-0000-000000000003',
  sessionId: 'sess_unprivileged',
  roles: ['guest'],
  permissions: [],
};

describe(
  'PROMPT 6 — Real Action, Planning, Tool, Task, Goal & Automation System',
  { timeout: 30000 },
  () => {
    beforeAll(async () => {
      try {
        await db.user.upsert({
          where: { id: userA.userId },
          update: {},
          create: {
            id: userA.userId,
            email: 'user-a@aether.local',
            fullName: 'Test User A',
          },
        });

        await db.user.upsert({
          where: { id: userB.userId },
          update: {},
          create: {
            id: userB.userId,
            email: 'user-b@aether.local',
            fullName: 'Test User B',
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
        console.warn('DB setup warning (mock mode will be used if DB unavailable):', e);
      }
    }, 60000);

    beforeEach(() => {
      actionAuditLogger.clear();
      planExecutor.clearIdempotencyCache();
    });

    afterEach(() => {
      actionAuditLogger.clear();
    });

    // ─── TEST 1 — TASK CREATION & VERIFICATION ─────────────────────────────────
    it('TEST 1 — TASK: Understands natural language task request, executes, verifies in DB, and reports', async () => {
      const userPrompt = 'Create a task called Fix authentication';

      // 1. Understand & Create Plan
      const plan = await planningEngine.createPlan(userPrompt, userA);
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.steps[0]?.toolName).toBe('create_task');
      expect(plan.steps[0]?.toolInput?.['title']).toContain('Fix authentication');

      // 2. Validate Plan
      const validation = planningEngine.validatePlan(plan, userA);
      expect(validation.valid).toBe(true);

      // 3. Execute & Verify
      const executionResult = await planExecutor.executePlan(plan, {
        auth: userA,
        traceId: 'trace_test_1',
      });

      expect(executionResult.status).toBe('SUCCESS');
      expect(executionResult.successfulStepsCount).toBe(1);
      expect(executionResult.failedStepsCount).toBe(0);

      const stepResult = executionResult.steps[0];
      expect(stepResult?.status).toBe('completed');
      expect(stepResult?.verified).toBe(true);
      expect(stepResult?.verificationDetails).toContain('verified in database');

      const createdTaskId = (stepResult?.result as any).taskId;
      expect(createdTaskId).toBeDefined();

      // 4. Direct DB Verification: Check actual record in TasksRepository
      const dbTask = await tasksRepo.findById(createdTaskId);
      expect(dbTask).not.toBeNull();
      expect(dbTask?.title).toBe('Fix authentication');
      expect(dbTask?.status).toBe(TaskStatus.TODO);

      // 5. Audit Log Verification
      const logs = await actionAuditLogger.getLogs({ userId: userA.userId });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0]?.toolName).toBe('create_task');
      expect(logs[0]?.verified).toBe(true);
    });

    // ─── TEST 2 — UPDATE TASK STATUS TO COMPLETE ───────────────────────────────
    it('TEST 2 — UPDATE: Updates task status, verifies in database that task is completed', async () => {
      // Setup: create real task in DB
      const initialTask = await tasksRepo.save({
        title: 'Fix authentication',
        creatorId: userA.userId,
        status: TaskStatus.TODO,
        priority: 'HIGH' as any,
      });

      // Execute complete_task tool
      const completeResult = await toolExecutor.execute(
        'complete_task',
        { taskId: initialTask.id },
        { auth: userA, traceId: 'trace_test_2' },
      );

      expect(completeResult.success).toBe(true);
      expect(completeResult.verified).toBe(true);
      expect(completeResult.verificationDetails).toContain('verified as completed');

      // Authoritative DB verification
      const updatedTask = await tasksRepo.findById(initialTask.id);
      expect(updatedTask).not.toBeNull();
      expect(updatedTask?.status).toBe(TaskStatus.DONE);
      expect(updatedTask?.isCompleted).toBe(true);
      expect(updatedTask?.completedAt).toBeInstanceOf(Date);
    });

    // ─── TEST 3 — MULTI-STEP PLAN PREPARATION ─────────────────────────────────
    it('TEST 3 — MULTI-STEP PLAN: "Prepare everything I need for tomorrow\'s project review" executes sequentially and verifies', async () => {
      const userPrompt = "Prepare everything I need for tomorrow's project review";

      // 1. Create Plan
      const plan = await planningEngine.createPlan(userPrompt, userA);
      expect(plan.steps.length).toBe(4);
      expect(plan.steps.map((s) => s.toolName)).toEqual([
        'list_projects',
        'list_tasks',
        'get_goal_progress',
        'create_task',
      ]);

      // 2. Validate Plan
      const validation = planningEngine.validatePlan(plan, userA);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);

      // 3. Execute Multi-step Plan
      const planResult = await planExecutor.executePlan(plan, {
        auth: userA,
        traceId: 'trace_test_3',
      });

      expect(planResult.status).toBe('SUCCESS');
      expect(planResult.successfulStepsCount).toBe(4);
      expect(planResult.failedStepsCount).toBe(0);
      expect(planResult.steps.every((s) => s.status === 'completed' && s.verified)).toBe(true);

      // Verify task creation step verified in DB
      const prepTaskStep = planResult.steps.find((s) => s.toolName === 'create_task');
      expect(prepTaskStep).toBeDefined();
      const prepTaskId = (prepTaskStep?.result as any).taskId;
      const dbTask = await tasksRepo.findById(prepTaskId);
      expect(dbTask).not.toBeNull();
      expect(dbTask?.title).toContain('Project Review Summary');
    });

    // ─── TEST 4 — AUTOMATION CREATION ──────────────────────────────────────────
    it('TEST 4 — AUTOMATION: "Every Monday at 9 AM, prepare my weekly project summary" creates verified DB automation', async () => {
      const userPrompt = 'Every Monday at 9 AM, prepare my weekly project summary';

      // 1. Create Plan
      const plan = await planningEngine.createPlan(userPrompt, userA);
      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0]?.toolName).toBe('create_automation');

      // 2. Execute Plan
      const planResult = await planExecutor.executePlan(plan, {
        auth: userA,
        traceId: 'trace_test_4',
      });

      expect(planResult.status).toBe('SUCCESS');
      const autoResult = planResult.steps[0]?.result as any;
      expect(autoResult?.automationId).toBeDefined();

      // 3. Direct DB verification
      const dbAuto = await automationService.getAutomationById(autoResult.automationId);
      expect(dbAuto).not.toBeNull();
      expect(dbAuto.name).toBe('Weekly Project Summary');
      expect(dbAuto.trigger).toBe('SCHEDULE');
      expect(dbAuto.schedule).toBe('0 9 * * 1');
    });

    // ─── TEST 5 — FAILURE REPORTING (NEVER SAY DONE ON FAILURE) ─────────────────
    it('TEST 5 — FAILURE: Tool failure is reported accurately and never falsely claimed as done', async () => {
      // Attempt to complete a non-existent task ID
      const failResult = await toolExecutor.execute(
        'complete_task',
        { taskId: '00000000-0000-0000-0000-999999999999' },
        { auth: userA, traceId: 'trace_test_5' },
      );

      expect(failResult.success).toBe(false);
      expect(failResult.code).toBe('TOOL_EXECUTION_FAILED');
      expect(failResult.error).toContain('not found');

      // Response Validator check: Response validator rejects claiming success when tool failed
      const responseValidation = responseValidator.validate(
        {
          requestId: 'req_1',
          userId: userA.userId,
          sessionId: userA.sessionId,
          conversationId: 'c1',
          message: 'Mark non-existent task complete',
          timestamp: Date.now(),
        },
        {
          type: 'PROJECT_WORKSPACE_TASK',
          confidence: 0.9,
          requiresTool: true,
          requiresRAG: false,
          requiresMemory: false,
          requiresAgent: false,
        },
        {
          userId: userA.userId,
          sessionId: userA.sessionId,
          conversationId: 'c1',
          tokenBudget: {
            total: 1000,
            system: 200,
            history: 200,
            context: 300,
            response: 300,
            remaining: 700,
          },
          workingMemory: { sessionId: userA.sessionId, items: [] },
        },

        'I have marked the task as completed successfully.',
        true, // toolExecuted
        false, // toolSuccess = FALSE
        false, // toolVerified = FALSE
      );

      expect(responseValidation.valid).toBe(false);
      expect(responseValidation.correctedContent).toContain('could not be completed');
      expect(responseValidation.correctedContent).not.toContain('successfully');
    });

    // ─── TEST 6 — PERMISSION ENFORCEMENT & ISOLATION ────────────────────────────
    it('TEST 6 — PERMISSION: Unauthorized user or action without permissions is DENIED', async () => {
      // User without 'tasks:write' permission attempts to create a task
      const deniedResult = await toolExecutor.execute(
        'create_task',
        { title: 'Unauthorized Task' },
        { auth: unprivilegedUser, traceId: 'trace_test_6' },
      );

      expect(deniedResult.success).toBe(false);
      expect(deniedResult.code).toBe('FORBIDDEN');
      expect(deniedResult.error).toContain('Unauthorized');

      // User isolation: User A's resource ownership check against User B
      const userAAccessToUserB = toolPermissions.checkResourceAccess(
        userB.userId,
        userA.userId,
        userA.roles,
      );
      expect(userAAccessToUserB).toBe(false);

      const userBAccessToUserA = toolPermissions.checkResourceAccess(
        userA.userId,
        userB.userId,
        userB.roles,
      );
      expect(userBAccessToUserA).toBe(false);
    });

    // ─── TEST 7 — IDEMPOTENCY ──────────────────────────────────────────────────
    it('TEST 7 — DUPLICATION: Repeated execution with same idempotencyKey does not recreate duplicates', async () => {
      const plan = await planningEngine.createPlan('Create a task called Idempotent Task', userA);

      const idempotencyKey = 'idemp_key_12345';

      // First execution
      const firstExec = await planExecutor.executePlan(
        plan,
        { auth: userA, traceId: 'trace_idemp_1' },
        { idempotencyKey },
      );
      expect(firstExec.status).toBe('SUCCESS');
      const firstTaskId = (firstExec.steps[0]?.result as any).taskId;

      // Second execution with same key (e.g. network retry)
      const secondExec = await planExecutor.executePlan(
        plan,
        { auth: userA, traceId: 'trace_idemp_2' },
        { idempotencyKey },
      );
      expect(secondExec.status).toBe('SUCCESS');
      expect(secondExec.summary).toContain('[Idempotent Replay]');
      const secondTaskId = (secondExec.steps[0]?.result as any).taskId;

      // Must return the exact cached result, avoiding duplicate database creation
      expect(secondTaskId).toBe(firstTaskId);
    });

    // ─── TEST 8 — PARTIAL FAILURE REPORTING ─────────────────────────────────────
    it('TEST 8 — PARTIAL FAILURE: Reports succeeded and failed actions with PARTIAL_SUCCESS', async () => {
      const multiPlan = {
        planId: 'plan_partial_test',
        objective: 'Run valid task search and complete non-existent task',
        totalSteps: 2,
        requiresConfirmation: false,
        createdAt: new Date().toISOString(),
        steps: [
          {
            stepId: 'step_1',
            stepNumber: 1,
            description: 'List user tasks',
            toolName: 'list_tasks',
            toolInput: { limit: 5 },
            riskLevel: 'READ_ONLY' as const,
            status: 'pending' as const,
            verified: false,
          },
          {
            stepId: 'step_2',
            stepNumber: 2,
            description: 'Complete non-existent task',
            toolName: 'complete_task',
            toolInput: { taskId: '00000000-0000-0000-0000-888888888888' },
            riskLevel: 'LOW_RISK' as const,
            status: 'pending' as const,
            verified: false,
          },
        ],
      };

      const result = await planExecutor.executePlan(multiPlan, {
        auth: userA,
        traceId: 'trace_partial_test',
      });

      expect(result.status).toBe('PARTIAL_SUCCESS');
      expect(result.successfulStepsCount).toBe(1);
      expect(result.failedStepsCount).toBe(1);

      // Discloses successful step and failed step explicitly
      expect(result.summary).toContain('1 actions completed successfully');
      expect(result.summary).toContain('1 action could not be completed');
      expect(result.summary).toContain('Step 2');

      expect(result.steps[0]?.status).toBe('completed');
      expect(result.steps[0]?.verified).toBe(true);

      expect(result.steps[1]?.status).toBe('failed');
      expect(result.steps[1]?.verified).toBe(false);
      expect(result.steps[1]?.error).toContain('not found');
    });

    // ─── GOAL & PRODUCTIVITY TOOL UNIT TESTS ───────────────────────────────────
    it('Goal and Productivity tools compute real metrics from actual database data', async () => {
      // 1. Create a goal
      const goalRes = await toolExecutor.execute(
        'create_goal',
        {
          title: 'Complete Aether Backend Action System',
          targetValue: 100,
          unit: '%',
          category: 'Development',
        },
        { auth: userA, traceId: 'trace_goal_1' },
      );

      expect(goalRes.success).toBe(true);
      expect(goalRes.verified).toBe(true);
      const goalId = (goalRes.data as any).goalId;

      // 2. Update goal progress
      const updateGoalRes = await toolExecutor.execute(
        'update_goal',
        { goalId, progress: 75 },
        { auth: userA, traceId: 'trace_goal_2' },
      );
      expect(updateGoalRes.success).toBe(true);
      expect(updateGoalRes.verified).toBe(true);

      // 3. Get Goal Progress
      const progressRes = await toolExecutor.execute(
        'get_goal_progress',
        { goalId },
        { auth: userA, traceId: 'trace_goal_3' },
      );
      expect(progressRes.success).toBe(true);
      expect((progressRes.data as any).averageProgressPercent).toBe(75);

      // 4. Productivity Summary
      const prodRes = await toolExecutor.execute(
        'get_productivity_summary',
        { timeRange: 'all_time' },
        { auth: userA, traceId: 'trace_prod_1' },
      );
      expect(prodRes.success).toBe(true);
      expect((prodRes.data as any).activeGoals).toBeGreaterThanOrEqual(1);

      // 5. Today's schedule
      const schedRes = await toolExecutor.execute(
        'get_todays_schedule',
        {},
        { auth: userA, traceId: 'trace_sched_1' },
      );
      expect(schedRes.success).toBe(true);
      expect((schedRes.data as any).targetDate).toBeDefined();
    });

    // ─── CONFIRMATION MANAGER & SCHEMA VALIDATOR TESTS ──────────────────────────
    it('Confirmation manager requires explicit confirmation for HIGH_IMPACT actions', () => {
      // Deletion requires confirmation
      const delTaskNeedsConf = confirmationManager.requiresConfirmation('delete_task', {
        taskId: 'tsk_1',
      });
      expect(delTaskNeedsConf).toBe(true);

      const confReq = confirmationManager.createConfirmationRequest('delete_task', {
        taskId: 'tsk_1',
      });
      expect(confReq.riskLevel).toBe('DESTRUCTIVE');
      expect(confReq.description).toContain('WHAT');
      expect(confReq.description).toContain('WHY');
      expect(confReq.description).toContain('WHICH RESOURCE');

      // Read actions do not require confirmation
      const readNeedsConf = confirmationManager.requiresConfirmation('list_tasks', {});
      expect(readNeedsConf).toBe(false);
    });

    it('Tool validator strictly validates parameters against JSON schema', () => {
      const invalidTitle = toolValidator.validate(
        { title: null },
        toolRegistry.get('create_task')!.inputSchema,
      );
      expect(invalidTitle.valid).toBe(false);
      expect(invalidTitle.errors.length).toBeGreaterThanOrEqual(1);

      const validTitle = toolValidator.validate(
        { title: 'Valid Task Title', priority: 'high' },
        toolRegistry.get('create_task')!.inputSchema,
      );
      expect(validTitle.valid).toBe(true);
    });
  },
);
