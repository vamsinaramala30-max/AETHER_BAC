/**
 * AETHER Phase 4 — Autonomous Agent Execution & Advanced Tool Calling Test Suite
 *
 * Verifies the complete autonomous agent chain:
 * Understand -> Plan -> Select Tools -> Request Authorization -> Execute Real DB Tools ->
 * Observe -> Reason -> Continue -> Verify -> Report Completion.
 *
 * Invariants:
 * 1. Single authoritative tool registry (zero fake/mock tools in production paths).
 * 2. Real PostgreSQL persistence and verification for all domain mutations.
 * 3. Strict schema validation and prototype pollution prevention.
 * 4. Multi-tenant isolation: zero cross-tenant access.
 * 5. High-risk operations require explicit confirmation approval.
 * 6. Cancellation via AbortSignal and bounded timeouts.
 * 7. Idempotency caching prevents duplicate execution.
 * 8. Sanitized tool results and prompt-injection quarantine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { toolRegistry } from '../../modules/ai/tools/tool-registry.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { toolValidator } from '../../modules/ai/tools/tool-validator.js';
import { toolPermissions } from '../../modules/ai/tools/tool-permissions.js';
import { planningEngine } from '../../modules/ai/planning/planning-engine.js';
import { executionEngine } from '../../modules/ai/execution/execution-engine.js';
import { db } from '../../database/client.js';
import type {
  AuthenticationContext,
  ToolExecutionContext,
} from '../../modules/ai/tools/tool-types.js';

// Auto-register all tools
import '../../modules/ai/tools/index.js';

describe('AETHER Phase 4 — Autonomous Agent Execution & Tool Calling Verification', () => {
  const tenantA_User = 'a4444444-4444-4444-a444-444444444444';
  const tenantA_Workspace = 'w4444444-4444-4444-a444-444444444444';
  const tenantB_User = 'b5555555-5555-4555-b555-555555555555';
  const tenantB_Workspace = 'w5555555-5555-4555-b555-555555555555';

  const authUserA: AuthenticationContext = {
    userId: tenantA_User,
    sessionId: 'sess_' + tenantA_User,
    workspaceId: tenantA_Workspace,
    userWorkspaceIds: [tenantA_Workspace],
    roles: ['user'],
    permissions: [
      'tasks:read',
      'tasks:write',
      'projects:read',
      'projects:write',
      'goals:read',
      'goals:write',
      'calendar:read',
      'calendar:write',
      'notifications:write',
      'knowledge:read',
      'knowledge:write',
      'memory:read',
      'memory:write',
      'productivity:read',
      'productivity:write',
    ],
  };

  const authUserB: AuthenticationContext = {
    userId: tenantB_User,
    sessionId: 'sess_' + tenantB_User,
    workspaceId: tenantB_Workspace,
    userWorkspaceIds: [tenantB_Workspace],
    roles: ['user'],
    permissions: [
      'tasks:read',
      'tasks:write',
      'projects:read',
      'projects:write',
    ],
  };

  const contextA: ToolExecutionContext = {
    auth: authUserA,
    traceId: `trace_p4_${Date.now()}`,
    correlationId: `corr_p4_${Date.now()}`,
  };

  const contextB: ToolExecutionContext = {
    auth: authUserB,
    traceId: `trace_p4_b_${Date.now()}`,
    correlationId: `corr_p4_b_${Date.now()}`,
  };

  // ─── 1. Authoritative Tool Registry (Phase 4.2) ───────────────────────────
  describe('Phase 4.2: Authoritative Tool Registry Completeness', () => {
    const requiredConceptualTools = [
      // Workspace
      'create_task',
      'update_task',
      'complete_task',
      'delete_task',
      'create_project',
      'update_project',
      'create_goal',
      'update_goal',
      // Knowledge
      'search_knowledge',
      'retrieve_document',
      'search_memory',
      // Productivity
      'create_calendar_event',
      'update_calendar_event',
      'create_reminder',
      // Analysis
      'analyze_project',
      'summarize_document',
      'generate_plan',
    ];

    it('contains all required Phase 4.2 conceptual tools in single authoritative registry', () => {
      for (const toolName of requiredConceptualTools) {
        expect(toolRegistry.has(toolName), `Tool "${toolName}" must exist in toolRegistry`).toBe(true);
        const tool = toolRegistry.get(toolName);
        expect(tool).toBeDefined();
        expect(tool?.name).toBe(toolName);
        expect(tool?.description).toBeDefined();
        expect(tool?.inputSchema).toBeDefined();
        expect(typeof tool?.handler).toBe('function');
      }
    });

    it('public tool descriptors do not expose raw handler functions', () => {
      const descriptors = toolRegistry.list();
      expect(descriptors.length).toBeGreaterThanOrEqual(requiredConceptualTools.length);
      for (const d of descriptors) {
        expect((d as any).handler).toBeUndefined();
        expect(d.name).toBeDefined();
        expect(d.category).toBeDefined();
        expect(d.riskLevel).toBeDefined();
      }
    });
  });

  // ─── 2. Real PostgreSQL Task Operations & State Verification ──────────────
  describe('Phase 4.3 & 4.4: Real Task Execution & Verification in PostgreSQL', () => {
    let createdTaskId: string;

    it('creates a real task in PostgreSQL and verifies its persisted state', async () => {
      const result = await toolExecutor.execute<{ taskId: string; title: string; status: string }>(
        'create_task',
        {
          title: 'Phase 4 Real Execution Task',
          description: 'Testing real PostgreSQL database persistence and verification',
          priority: 'high',
        },
        contextA,
      );

      expect(result.success).toBe(true);
      expect(result.code).toBe('SUCCESS');
      expect(result.verified).toBe(true);
      expect(result.data?.taskId).toBeDefined();
      createdTaskId = result.data!.taskId;

      // Verify directly against PostgreSQL
      const dbTask = await db.task.findUnique({ where: { id: createdTaskId } });
      expect(dbTask).not.toBeNull();
      expect(dbTask?.title).toBe('Phase 4 Real Execution Task');
      expect(dbTask?.creatorId).toBe(authUserA.userId);
    });

    it('updates the task in PostgreSQL and verifies the updated properties', async () => {
      expect(createdTaskId).toBeDefined();
      const updateResult = await toolExecutor.execute(
        'update_task',
        {
          taskId: createdTaskId,
          title: 'Phase 4 Updated Task Title',
          priority: 'urgent',
        },
        contextA,
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.verified).toBe(true);

      const dbTask = await db.task.findUnique({ where: { id: createdTaskId } });
      expect(dbTask?.title).toBe('Phase 4 Updated Task Title');
      expect(dbTask?.priority).toBe('URGENT');
    });

    it('completes the task and verifies DONE status in PostgreSQL', async () => {
      expect(createdTaskId).toBeDefined();
      const completeResult = await toolExecutor.execute(
        'complete_task',
        { taskId: createdTaskId },
        contextA,
      );

      expect(completeResult.success).toBe(true);
      expect(completeResult.verified).toBe(true);

      const dbTask = await db.task.findUnique({ where: { id: createdTaskId } });
      expect(dbTask?.status).toBe('DONE');
      expect(dbTask?.completedAt).not.toBeNull();
    });
  });

  // ─── 3. Real Project Operations & Analysis ────────────────────────────────
  describe('Phase 4: Real Project Operations & Analysis Tool', () => {
    let createdProjectId: string;

    it('creates a project in PostgreSQL with real verification', async () => {
      const result = await toolExecutor.execute<{ projectId: string; name: string }>(
        'create_project',
        {
          name: 'AETHER Autonomous Systems Project',
          description: 'Phase 4 Real Autonomous Execution System',
        },
        contextA,
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      createdProjectId = result.data!.projectId;

      const dbProj = await db.project.findUnique({ where: { id: createdProjectId } });
      expect(dbProj).not.toBeNull();
      expect(dbProj?.name).toBe('AETHER Autonomous Systems Project');
    });

    it('analyzes the project and produces real metrics against PostgreSQL tasks', async () => {
      expect(createdProjectId).toBeDefined();

      // Seed a task under this project
      await toolExecutor.execute(
        'create_task',
        {
          title: 'Project Milestone 1 Task',
          projectId: createdProjectId,
          priority: 'high',
        },
        contextA,
      );

      const analysisResult = await toolExecutor.execute<{
        projectId: string;
        projectName: string;
        healthStatus: string;
        totalTasks: number;
        completionRate: number;
      }>(
        'analyze_project',
        { projectId: createdProjectId },
        contextA,
      );

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.verified).toBe(true);
      expect(analysisResult.data?.projectId).toBe(createdProjectId);
      expect(analysisResult.data?.projectName).toBe('AETHER Autonomous Systems Project');
      expect(analysisResult.data?.totalTasks).toBeGreaterThanOrEqual(1);
      expect(typeof analysisResult.data?.completionRate).toBe('number');
    });
  });

  // ─── 4. Real Productivity Tools (Calendar & Reminders) ────────────────────
  describe('Phase 4.2 & 4.3: Real Calendar & Reminder Tools in PostgreSQL', () => {
    let createdEventId: string;
    let createdReminderId: string;

    it('creates a calendar event in PostgreSQL and verifies its existence', async () => {
      const startDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const endDate = new Date(Date.now() + 7200 * 1000).toISOString();

      const result = await toolExecutor.execute<{ eventId: string; title: string }>(
        'create_calendar_event',
        {
          title: 'AETHER Architecture Review',
          startDate,
          endDate,
          location: 'Virtual Briefing Room',
          description: 'Autonomous tool execution review',
        },
        contextA,
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      createdEventId = result.data!.eventId;

      const dbEvent = await db.calendarEvent.findUnique({ where: { id: createdEventId } });
      expect(dbEvent).not.toBeNull();
      expect(dbEvent?.title).toBe('AETHER Architecture Review');
      expect(dbEvent?.userId).toBe(authUserA.userId);
    });

    it('updates the calendar event and verifies state change in PostgreSQL', async () => {
      expect(createdEventId).toBeDefined();
      const updateResult = await toolExecutor.execute(
        'update_calendar_event',
        {
          eventId: createdEventId,
          title: 'AETHER Architecture Review (Rescheduled)',
          location: 'Secure War Room',
        },
        contextA,
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.verified).toBe(true);

      const dbEvent = await db.calendarEvent.findUnique({ where: { id: createdEventId } });
      expect(dbEvent?.title).toBe('AETHER Architecture Review (Rescheduled)');
      expect(dbEvent?.location).toBe('Secure War Room');
    });

    it('creates a reminder notification in PostgreSQL and verifies real record', async () => {
      const result = await toolExecutor.execute<{ reminderId: string; title: string }>(
        'create_reminder',
        {
          title: 'Deploy Phase 4 Verification',
          message: 'Ensure all tests pass and audit log records execution.',
          dueDate: new Date(Date.now() + 86400 * 1000).toISOString(),
        },
        contextA,
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      createdReminderId = result.data!.reminderId;

      const dbNotif = await db.notification.findUnique({ where: { id: createdReminderId } });
      expect(dbNotif).not.toBeNull();
      expect(dbNotif?.title).toBe('Deploy Phase 4 Verification');
      expect(dbNotif?.userId).toBe(authUserA.userId);
    });
  });

  // ─── 5. Real Goal Operations ──────────────────────────────────────────────
  describe('Phase 4: Real Goal Tools in PostgreSQL', () => {
    let createdGoalId: string;

    it('creates a measurable goal in PostgreSQL and verifies target progress', async () => {
      const result = await toolExecutor.execute<{ goalId: string; title: string; targetValue: number }>(
        'create_goal',
        {
          title: 'Achieve 100% Autonomous Test Coverage',
          description: 'Phase 4 verification target',
          targetValue: 100,
          unit: '%',
        },
        contextA,
      );

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      createdGoalId = result.data!.goalId;

      const dbGoal = await db.goal.findUnique({ where: { id: createdGoalId } });
      expect(dbGoal).not.toBeNull();
      expect(dbGoal?.title).toBe('Achieve 100% Autonomous Test Coverage');
    });

    it('updates goal progress and verifies progression in PostgreSQL', async () => {
      expect(createdGoalId).toBeDefined();
      const updateResult = await toolExecutor.execute(
        'update_goal',
        {
          goalId: createdGoalId,
          progress: 85,
        },
        contextA,
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.verified).toBe(true);

      const dbGoal = await db.goal.findUnique({ where: { id: createdGoalId } });
      expect(dbGoal?.progress).toBe(85);
    });
  });

  // ─── 6. Knowledge & Document Tools ────────────────────────────────────────
  describe('Phase 4: Knowledge, Document, and Memory Tools', () => {
    let createdDocId: string;
    let createdMemoryId: string;

    it('adds a knowledge document and verifies RAG retrieval and summary', async () => {
      const addResult = await toolExecutor.execute<{ documentId: string; title: string }>(
        'add_knowledge_document',
        {
          title: 'AETHER Phase 4 Execution Specification',
          content: 'The autonomous agent pipeline coordinates planning, tool execution, and verification.',
        },
        contextA,
      );

      expect(addResult.success).toBe(true);
      expect(addResult.verified).toBe(true);
      createdDocId = addResult.data!.documentId;

      // Authoritative retrieve_document alias test
      const retrieveResult = await toolExecutor.execute<{ documentId: string; title: string }>(
        'retrieve_document',
        { documentId: createdDocId },
        contextA,
      );
      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.data?.title).toBe('AETHER Phase 4 Execution Specification');

      // Summarize document tool test
      const summaryResult = await toolExecutor.execute<{ documentId: string; wordCount: number; summary: string }>(
        'summarize_document',
        { documentId: createdDocId },
        contextA,
      );
      expect(summaryResult.success).toBe(true);
      expect(summaryResult.verified).toBe(true);
      expect(summaryResult.data?.wordCount).toBeGreaterThan(0);
      expect(summaryResult.data?.summary.length).toBeGreaterThan(0);
    });

    it('stores a memory fact and verifies recall via search_memory alias', async () => {
      const storeResult = await toolExecutor.execute<{ memoryId: string; content: string }>(
        'store_memory',
        {
          content: 'User preferred language is TypeScript for backend systems.',
          type: 'preference',
          importance: 9,
        },
        contextA,
      );

      expect(storeResult.success).toBe(true);
      expect(storeResult.verified).toBe(true);
      createdMemoryId = storeResult.data!.memoryId;

      const recallResult = await toolExecutor.execute<{ memories: any[]; total: number }>(
        'search_memory',
        { query: 'preferred language' },
        contextA,
      );
      expect(recallResult.success).toBe(true);
      expect(recallResult.data?.total ?? recallResult.data?.memories?.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 7. Multi-Step Plan Generation (Phase 4.6) ─────────────────────────────
  describe('Phase 4.6: Multi-Step Plan Generation', () => {
    it('generates a bounded, structured topological plan via generate_plan tool', async () => {
      const planResult = await toolExecutor.execute<{
        planId: string;
        objective: string;
        stepsCount: number;
        steps: Array<{ order: number; toolName: string; description: string }>;
      }>(
        'generate_plan',
        {
          objective: 'Prepare project review and organize tasks',
        },
        contextA,
      );

      expect(planResult.success).toBe(true);
      expect(planResult.verified).toBe(true);
      expect(planResult.data?.planId).toBeDefined();
      expect(planResult.data?.stepsCount).toBeGreaterThan(0);
      expect(planResult.data?.steps.length).toBe(planResult.data?.stepsCount);
    });
  });

  // ─── 8. Security: Input Validation & Sanitization (Phase 4.3 & 4.14) ───────
  describe('Phase 4.3 & 4.14: Security, Input Validation & Prototype Protection', () => {
    it('rejects input with missing required fields', async () => {
      const result = await toolExecutor.execute(
        'create_task',
        {} as any, // missing required 'title'
        contextA,
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.error).toContain('Missing required field');
    });

    it('rejects prototype pollution attempts immediately in validator', async () => {
      const maliciousInput = JSON.parse('{"title": "Exploit", "__proto__": {"polluted": true}}');
      const result = await toolExecutor.execute(
        'create_task',
        maliciousInput,
        contextA,
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.error).toContain('Dangerous parameter key');
    });

    it('rejects invalid types and bounds', async () => {
      const result = await toolExecutor.execute(
        'store_memory',
        {
          content: 'Test invalid importance',
          importance: 999, // maximum allowed is 10
        },
        contextA,
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_INPUT');
    });
  });

  // ─── 9. Security: Multi-Tenant & User Authorization Isolation (Phase 4.4) ─
  describe('Phase 4.4: Multi-Tenant and User Authorization Boundary Enforcement', () => {
    let tenantATaskId: string;

    beforeEach(async () => {
      const taskRes = await toolExecutor.execute<{ taskId: string }>(
        'create_task',
        { title: 'Tenant A Confidential Task' },
        contextA,
      );
      tenantATaskId = taskRes.data!.taskId;
    });

    it('prevents Tenant B from reading Tenant A task', async () => {
      const crossTenantAttempt = await toolExecutor.execute(
        'get_task',
        { taskId: tenantATaskId },
        contextB, // Tenant B attempting to read Tenant A's task
      );

      expect(crossTenantAttempt.success).toBe(false);
      expect(['FORBIDDEN', 'UNAUTHORIZED_RESOURCE']).toContain(crossTenantAttempt.code);
    });

    it('prevents Tenant B from updating or deleting Tenant A task', async () => {
      const crossTenantUpdate = await toolExecutor.execute(
        'update_task',
        { taskId: tenantATaskId, title: 'Hacked by Tenant B' },
        contextB,
      );

      expect(crossTenantUpdate.success).toBe(false);
      expect(['FORBIDDEN', 'UNAUTHORIZED_RESOURCE']).toContain(crossTenantUpdate.code);

      // Task remains untouched in PostgreSQL
      const dbTask = await db.task.findUnique({ where: { id: tenantATaskId } });
      expect(dbTask?.title).toBe('Tenant A Confidential Task');
    });

    it('overwrites spoofed userId/workspaceId in tool input with authenticated context', async () => {
      const spoofedInput = {
        title: 'Tampered Identity Task',
        userId: tenantB_User, // Attacker tries to pretend to be User B
        workspaceId: tenantB_Workspace,
      };

      const result = await toolExecutor.execute<{ taskId: string }>(
        'create_task',
        spoofedInput,
        contextA, // User A is authenticated
      );

      expect(result.success).toBe(true);
      const dbTask = await db.task.findUnique({ where: { id: result.data!.taskId } });
      // Database MUST reflect User A, not the spoofed User B
      expect(dbTask?.creatorId).toBe(authUserA.userId);
    });

    it('rejects execution when required permissions are missing', async () => {
      const restrictedAuth: AuthenticationContext = {
        ...authUserA,
        permissions: ['tasks:read'], // missing 'tasks:write'
      };

      const result = await toolExecutor.execute(
        'create_task',
        { title: 'Unauthorized Creation Attempt' },
        { auth: restrictedAuth, traceId: 'trace_perm' },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
      expect(result.error).toContain('Unauthorized to execute tool');
    });
  });

  // ─── 10. Risk Classification & Confirmation Gate (Phase 4.5) ──────────────
  describe('Phase 4.5: Risk Classification and Confirmation Safeguards', () => {
    it('classifies read-only operations as READ_ONLY and writes as LOW_RISK/MEDIUM_RISK', () => {
      const getTask = toolRegistry.get('get_task');
      expect(getTask?.riskLevel).toBe('READ_ONLY');

      const createTask = toolRegistry.get('create_task');
      expect(createTask?.riskLevel).toBe('LOW_RISK');

      const analyzeProject = toolRegistry.get('analyze_project');
      expect(analyzeProject?.riskLevel).toBe('READ_ONLY');
    });

    it('marks destructive operations (delete_task, delete_project) as HIGH_IMPACT requiring confirmation', () => {
      const deleteTask = toolRegistry.get('delete_task');
      expect(deleteTask?.riskLevel).toBe('HIGH_IMPACT');
      expect(deleteTask?.requiresConfirmation).toBe(true);

      const deleteProject = toolRegistry.get('delete_project');
      expect(deleteProject?.riskLevel).toBe('HIGH_IMPACT');
      expect(deleteProject?.requiresConfirmation).toBe(true);
    });

    it('rejects unconfirmed execution of HIGH_IMPACT tools when confirmation is not provided', async () => {
      const unconfirmedAttempt = await toolExecutor.execute(
        'delete_task',
        { taskId: crypto.randomUUID() },
        contextA,
        { confirmed: false }, // Explicitly unconfirmed
      );

      expect(unconfirmedAttempt.success).toBe(false);
      expect(unconfirmedAttempt.code).toBe('CONFIRMATION_REQUIRED');
      expect(unconfirmedAttempt.actionState).toBe('AWAITING_APPROVAL');
    });
  });

  // ─── 11. Cancellation & Timeout (Phase 4.11 & 4.12) ────────────────────────
  describe('Phase 4.11 & 4.12: Cancellation & Timeout Safeguards', () => {
    it('immediately aborts execution when AbortSignal is cancelled', async () => {
      const abortController = new AbortController();
      abortController.abort(); // Pre-aborted signal

      const result = await toolExecutor.execute(
        'create_task',
        { title: 'Cancelled Task' },
        contextA,
        { signal: abortController.signal },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('CANCELLED');
    });

    it('terminates with TIMEOUT when tool execution exceeds timeout limit', async () => {
      const result = await toolExecutor.execute(
        'create_task',
        { title: 'Timeout Task' },
        contextA,
        { timeoutMs: 0.001 }, // Impossibly low timeout to trigger timeout branch
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('TIMEOUT');
    });
  });

  // ─── 12. Idempotency & Safe Retries (Phase 4.10) ───────────────────────────
  describe('Phase 4.10: Idempotency Protection', () => {
    it('returns cached result for duplicate requests without repeating DB insertion', async () => {
      const idempotencyKey = `idem_p4_${Date.now()}_${Math.random()}`;
      const uniqueTitle = `Idempotent Task Test ${Date.now()}`;

      // First call: executes real tool
      const firstResult = await toolExecutor.execute<{ taskId: string; title: string }>(
        'create_task',
        { title: uniqueTitle },
        contextA,
        { idempotencyKey },
      );
      expect(firstResult.success).toBe(true);
      expect(firstResult.cached).toBeUndefined();
      const firstTaskId = firstResult.data!.taskId;

      // Second call with same idempotency key: returns cached result
      const secondResult = await toolExecutor.execute<{ taskId: string; title: string }>(
        'create_task',
        { title: uniqueTitle },
        contextA,
        { idempotencyKey },
      );
      expect(secondResult.success).toBe(true);
      expect(secondResult.cached).toBe(true);
      expect(secondResult.data?.taskId).toBe(firstTaskId);

      // Verify only ONE task was created in PostgreSQL
      const matchingTasks = await db.task.findMany({
        where: { title: uniqueTitle, creatorId: authUserA.userId, deletedAt: null },
      });
      expect(matchingTasks.length).toBe(1);
    });
  });
});
