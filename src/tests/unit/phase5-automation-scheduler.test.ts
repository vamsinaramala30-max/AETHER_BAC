/**
 * AETHER Phase 5 — Production Automation, Scheduler & Background Execution Verification
 * 
 * Verifies the authoritative server-side scheduling architecture:
 * 1. Schedule parsing, IANA timezones (IST, UTC, EDT, BST), canonical UTC timestamps
 * 2. Database-first recovery, atomic job claiming, and multi-worker race prevention
 * 3. Duplicate occurrence protection & idempotency
 * 4. Concurrency policies (SKIP_IF_RUNNING, ALLOW) and Missed policies (RUN_ONCE_IMMEDIATELY, SKIP, MARK_MISSED)
 * 5. Phase 4 Agent & Tool execution against live PostgreSQL (Tasks, Projects, Memory, RAG)
 * 6. Authorization recheck & tenant boundary enforcement
 * 7. Human confirmation gates (NEEDS_APPROVAL) for high-impact tools
 * 8. Cancellation (AbortSignal) and controlled execution timeouts
 * 9. Bounded exponential backoff retries & Circuit breaker auto-pausing
 * 10. Server restart recovery and scheduler health telemetry
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { db } from '../../database/client.js';
import { ScheduleManager } from '../../modules/automation/scheduler/schedule-manager.js';
import { AutomationScheduler } from '../../modules/automation/scheduler/automation-scheduler.js';
import { AutomationService } from '../../modules/automation/automation.service.js';
import { AutomationRepository } from '../../modules/automation/repositories/automation.repository.js';
import { ExecutionRepository } from '../../modules/automation/repositories/execution.repository.js';
import { ActivityRepository } from '../../modules/automation/repositories/activity.repository.js';
import { ExecutionEngine } from '../../modules/automation/engine/execution-engine.js';
import { ActionEngine } from '../../modules/automation/engine/action-engine.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { toolRegistry } from '../../modules/ai/tools/tool-registry.js';
import { ToolExecutionContext } from '../../modules/ai/tools/tool-types.js';
import { AutomationStatus } from '@prisma/client';
import { AppError } from '../../middleware/error.middleware.js';
import { randomUUID } from 'crypto';

// Register Phase 4 tools
import '../../modules/ai/tools/index.js';

describe('AETHER Phase 5 — Production Automation, Scheduler & Background Execution', () => {
  const tenantA_User = 'a5555555-5555-4555-a555-555555555555';
  const tenantA_Workspace = '05555555-5555-4555-a555-555555555555';
  const tenantB_User = 'b6666666-6666-4666-b666-666666666666';
  const tenantB_Workspace = '06666666-6666-4666-b666-666666666666';

  const toolContextA: ToolExecutionContext = {
    auth: {
      userId: tenantA_User,
      sessionId: `sess_p5_${Date.now()}`,
      roles: ['user'],
      permissions: ['*'],
      workspaceId: tenantA_Workspace,
      userWorkspaceIds: [tenantA_Workspace],
    },
    traceId: `trace_p5_${Date.now()}`,
    correlationId: `corr_p5_${Date.now()}`,
    workspaceId: tenantA_Workspace,
  };

  const autoRepo = new AutomationRepository();
  const execRepo = new ExecutionRepository();
  const actRepo = new ActivityRepository();
  const executionEngine = new ExecutionEngine(db as any);
  const actionEngine = new ActionEngine(db as any);

  let createdAutomationIds: string[] = [];
  let createdTaskIds: string[] = [];
  let createdProjectIds: string[] = [];
  let createdDocIds: string[] = [];

  beforeAll(async () => {
    // Provision tenant A user, workspace and membership
    await db.user.upsert({
      where: { id: tenantA_User },
      update: { deletedAt: null },
      create: {
        id: tenantA_User,
        email: `tenantA_${Date.now()}@aether.local`,
        role: 'ADMIN',
      },
    });

    await db.workspace.upsert({
      where: { id: tenantA_Workspace },
      update: { deletedAt: null },
      create: {
        id: tenantA_Workspace,
        name: 'Tenant A Workspace',
        slug: `tenant-a-${Date.now()}`,
      },
    });

    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: tenantA_Workspace,
          userId: tenantA_User,
        },
      },
      update: {},
      create: {
        workspaceId: tenantA_Workspace,
        userId: tenantA_User,
        role: 'OWNER',
      },
    });

    // Provision tenant B user, workspace and membership
    await db.user.upsert({
      where: { id: tenantB_User },
      update: { deletedAt: null },
      create: {
        id: tenantB_User,
        email: `tenantB_${Date.now()}@aether.local`,
        role: 'ADMIN',
      },
    });

    await db.workspace.upsert({
      where: { id: tenantB_Workspace },
      update: { deletedAt: null },
      create: {
        id: tenantB_Workspace,
        name: 'Tenant B Workspace',
        slug: `tenant-b-${Date.now()}`,
      },
    });

    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: tenantB_Workspace,
          userId: tenantB_User,
        },
      },
      update: {},
      create: {
        workspaceId: tenantB_Workspace,
        userId: tenantB_User,
        role: 'OWNER',
      },
    });
  });

  afterAll(async () => {
    try {
      await db.workspaceMember.deleteMany({
        where: { workspaceId: { in: [tenantA_Workspace, tenantB_Workspace] } },
      });
      await db.workspace.deleteMany({
        where: { id: { in: [tenantA_Workspace, tenantB_Workspace] } },
      });
      await db.user.deleteMany({
        where: { id: { in: [tenantA_User, tenantB_User] } },
      });
    } catch {}
  });

  afterEach(async () => {
    // Cleanup created automations and executions
    for (const autoId of createdAutomationIds) {
      try {
        await db.automationActivity.deleteMany({ where: { automationId: autoId } });
        await db.automationExecution.deleteMany({ where: { automationId: autoId } });
        await db.automation.deleteMany({ where: { id: autoId } });
      } catch {}
    }
    createdAutomationIds = [];

    // Cleanup created test records
    for (const taskId of createdTaskIds) {
      try {
        await db.task.deleteMany({ where: { id: taskId } });
      } catch {}
    }
    createdTaskIds = [];

    for (const projId of createdProjectIds) {
      try {
        await db.task.deleteMany({ where: { projectId: projId } });
        await db.project.deleteMany({ where: { id: projId } });
      } catch {}
    }
    createdProjectIds = [];

    for (const docId of createdDocIds) {
      try {
        await db.documentChunk.deleteMany({ where: { documentId: docId } });
        await db.document.deleteMany({ where: { id: docId } });
      } catch {}
    }
    createdDocIds = [];
  });

  // ============================================================================
  // 1. SCHEDULE PARSING, TIMEZONE CORRECTNESS & NEXT-RUN CALCULATION
  // ============================================================================
  describe('Phase 5.3 & 5.4: Schedule Parsing and Strict Timezone Correctness', () => {
    it('accurately parses ONE_TIME schedule and respects explicit timezones', () => {
      const futureDate = new Date(Date.now() + 3600000);
      const isoString = futureDate.toISOString();

      const nextRunUtc = ScheduleManager.calculateNextRun(isoString, 'UTC');
      expect(nextRunUtc).toBeDefined();
      expect(new Date(nextRunUtc!).toISOString()).toBe(isoString);

      // Verify that past one-time schedule returns null
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const pastNextRun = ScheduleManager.calculateNextRun(pastDate, 'UTC');
      expect(pastNextRun).toBeNull();
    });

    it('accurately computes daily schedule in Asia/Kolkata (IST +05:30) with UTC conversion', () => {
      // User specifies 08:00 AM IST
      // 08:00 AM IST is 02:30 AM UTC on the same calendar day
      const baseDate = new Date('2026-10-01T01:00:00.000Z'); // 06:30 AM IST

      const nextRun = ScheduleManager.calculateNextRun('08:00', 'Asia/Kolkata', baseDate);
      expect(nextRun).toBeDefined();

      const nextRunDate = new Date(nextRun!);
      // 08:00 AM IST = 02:30 AM UTC
      expect(nextRunDate.getUTCHours()).toBe(2);
      expect(nextRunDate.getUTCMinutes()).toBe(30);
      expect(nextRunDate.toISOString()).toBe('2026-10-01T02:30:00.000Z');
    });

    it('accurately advances daily schedule to next day when current time is past schedule', () => {
      // Current time is 10:30 AM IST (05:00 AM UTC)
      // Daily schedule at 08:00 AM IST must advance to tomorrow 02:30 AM UTC
      const baseDate = new Date('2026-10-01T05:00:00.000Z');

      const nextRun = ScheduleManager.calculateNextRun('08:00', 'Asia/Kolkata', baseDate);
      expect(nextRun).toBeDefined();

      const nextRunDate = new Date(nextRun!);
      expect(nextRunDate.toISOString()).toBe('2026-10-02T02:30:00.000Z');
    });

    it('accurately calculates INTERVAL schedules across UTC boundaries', () => {
      // Run every 6 hours (360 minutes)
      const baseDate = new Date('2026-10-01T12:00:00.000Z');

      const nextRun = ScheduleManager.calculateNextRun('360', 'UTC', baseDate);
      expect(nextRun).toBeDefined();

      const nextRunDate = new Date(nextRun!);
      expect(nextRunDate.toISOString()).toBe('2026-10-01T18:00:00.000Z');
    });

    it('accurately calculates WEEKLY schedules for specific weekdays', () => {
      // Target: Monday (1) at 09:00 UTC
      // Thursday 2026-10-01 (weekday 4) -> Next Monday is 2026-10-05
      const baseDate = new Date('2026-10-01T12:00:00.000Z'); // Thursday

      const nextRun = ScheduleManager.calculateNextRun('1 09:00', 'UTC', baseDate);
      expect(nextRun).toBeDefined();

      const nextRunDate = new Date(nextRun!);
      expect(nextRunDate.getUTCDay()).toBe(1); // Monday
      expect(nextRunDate.getUTCHours()).toBe(9);
      expect(nextRunDate.getUTCMinutes()).toBe(0);
      expect(nextRunDate.toISOString()).toBe('2026-10-05T09:00:00.000Z');
    });

    it('accurately handles Daylight Saving Time (EDT -04:00 vs EST -05:00)', () => {
      // 09:00 AM America/New_York during EDT (summer) = 13:00 UTC
      const summerDate = new Date('2026-07-01T10:00:00.000Z');
      const nextRunSummer = ScheduleManager.calculateNextRun('09:00', 'America/New_York', summerDate);
      expect(nextRunSummer).toBeDefined();
      const nextRunSummerDate = new Date(nextRunSummer!);
      expect(nextRunSummerDate.getUTCHours()).toBe(13); // EDT is UTC-4

      // 09:00 AM America/New_York during EST (winter) = 14:00 UTC
      const winterDate = new Date('2026-12-01T10:00:00.000Z');
      const nextRunWinter = ScheduleManager.calculateNextRun('09:00', 'America/New_York', winterDate);
      expect(nextRunWinter).toBeDefined();
      const nextRunWinterDate = new Date(nextRunWinter!);
      expect(nextRunWinterDate.getUTCHours()).toBe(14); // EST is UTC-5
    });

    it('validates IANA timezone strings and rejects malformed names', () => {
      expect(ScheduleManager.isValidTimezone('Asia/Kolkata')).toBe(true);
      expect(ScheduleManager.isValidTimezone('America/New_York')).toBe(true);
      expect(ScheduleManager.isValidTimezone('UTC')).toBe(true);
      expect(ScheduleManager.isValidTimezone('Europe/London')).toBe(true);

      expect(ScheduleManager.isValidTimezone('Invalid/Zone')).toBe(false);
      expect(ScheduleManager.isValidTimezone('US/RandomNonExistent')).toBe(false);
      expect(ScheduleManager.isValidTimezone('')).toBe(false);
    });
  });

  // ============================================================================
  // 2. DATABASE-FIRST SCHEDULING, ATOMIC CLAIMING & MULTI-WORKER ISOLATION
  // ============================================================================
  describe('Phase 5.5, 5.6, 5.7 & 5.31: Database-First Scheduling & Atomic Claiming', () => {
    it('discovers due automations from PostgreSQL using nextRunAt', async () => {
      const pastTime = new Date(Date.now() - 5000).toISOString();
      const auto = await autoRepo.create({
        name: 'Due Automation Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'SCHEDULE',
        schedule: '08:00',
        actions: [{ type: 'create_task', params: { title: 'Due task' } }],
        conditions: {
          _meta: {
            nextRunAt: pastTime,
            timezone: 'Asia/Kolkata',
            concurrencyPolicy: 'SKIP_IF_RUNNING',
          },
        },
      });
      createdAutomationIds.push(auto.id);

      const due = await autoRepo.findDueAutomations(new Date());
      const found = due.find((a) => a.id === auto.id);
      expect(found).toBeDefined();
    });

    it('atomically claims due automation and prevents concurrent claim by second worker', async () => {
      const pastTime = new Date(Date.now() - 2000).toISOString();
      const auto = await autoRepo.create({
        name: 'Atomic Claim Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'SCHEDULE',
        actions: [{ type: 'create_task', params: { title: 'Claim task' } }],
        conditions: {
          _meta: {
            nextRunAt: pastTime,
            timezone: 'UTC',
          },
        },
      });
      createdAutomationIds.push(auto.id);

      const workerA = 'worker_alpha_1';
      const workerB = 'worker_beta_2';

      // Worker A claims the automation
      const claimedA = await autoRepo.claimAutomation(auto.id, workerA, 30000);
      expect(claimedA).toBe(true);

      // Worker B attempts to claim the same automation while locked by Worker A
      const claimedB = await autoRepo.claimAutomation(auto.id, workerB, 30000);
      expect(claimedB).toBe(false); // Exactly one worker succeeds!

      // Worker A releases the claim
      const futureNext = new Date(Date.now() + 60000).toISOString();
      await autoRepo.releaseClaim(auto.id, workerA, futureNext, AutomationStatus.ACTIVE);

      // Verify lock is released and nextRunAt is updated in PostgreSQL
      const refreshed = await autoRepo.findById(auto.id);
      const meta = (refreshed?.conditions as any)?._meta;
      expect(meta.lockedBy).toBeNull();
      expect(meta.lockedUntil).toBeNull();
      expect(meta.nextRunAt).toBe(futureNext);
    });

    it('protects against duplicate execution of the exact same occurrence key', async () => {
      const occurrenceTime = '2026-10-01T08:00:00.000Z';
      const auto = await autoRepo.create({
        name: 'Duplicate Key Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'SCHEDULE',
        actions: [{ type: 'create_task', params: { title: 'Occur task' } }],
        conditions: {
          _meta: {
            nextRunAt: occurrenceTime,
            timezone: 'UTC',
          },
        },
      });
      createdAutomationIds.push(auto.id);

      const occurrenceKey = `${auto.id}:${occurrenceTime}`;

      // Simulate first execution recording its key
      const exec1 = await execRepo.createExecution({
        automationId: auto.id,
        triggerData: { executionKey: occurrenceKey },
        status: AutomationStatus.COMPLETED,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      // Verify lookup finds existing occurrence
      const existing = await execRepo.findByExecutionKey(auto.id, occurrenceKey);
      expect(existing).toBeDefined();
      expect(existing?.id).toBe(exec1.id);

      // Clean up execution
      await db.automationExecution.delete({ where: { id: exec1.id } });
    });
  });

  // ============================================================================
  // 3. CONCURRENCY & MISSED EXECUTION POLICIES
  // ============================================================================
  describe('Phase 5.9 & 5.10: Concurrency and Missed Execution Policies', () => {
    it('enforces SKIP_IF_RUNNING concurrency policy when an execution is currently active', async () => {
      const auto = await autoRepo.create({
        name: 'Concurrency Skip Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'SCHEDULE',
        actions: [{ type: 'create_task', params: { title: 'Concurrency task' } }],
        conditions: {
          _meta: {
            concurrencyPolicy: 'SKIP_IF_RUNNING',
            timezone: 'UTC',
          },
        },
      });
      createdAutomationIds.push(auto.id);

      // Create an active RUNNING execution
      const activeExec = await execRepo.createExecution({
        automationId: auto.id,
        status: AutomationStatus.RUNNING,
        startedAt: new Date(),
      });

      const scheduler = new AutomationScheduler(db as any);
      const processed = await scheduler.processDueAutomation(auto);

      // Since an execution is already RUNNING, SKIP_IF_RUNNING must skip without starting new execution
      expect(processed).toBe(false);

      // Cleanup
      await db.automationExecution.delete({ where: { id: activeExec.id } });
    });

    it('enforces ALLOW concurrency policy allowing parallel executions', async () => {
      const auto = await autoRepo.create({
        name: 'Concurrency Allow Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'SCHEDULE',
        actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Allow task' } }],
        conditions: {
          _meta: {
            concurrencyPolicy: 'ALLOW',
            timezone: 'UTC',
            nextRunAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      });
      createdAutomationIds.push(auto.id);

      // Create an active RUNNING execution
      const activeExec = await execRepo.createExecution({
        automationId: auto.id,
        status: AutomationStatus.RUNNING,
        startedAt: new Date(),
      });

      // Claiming is possible under ALLOW policy even with active executions
      const claimed = await autoRepo.claimAutomation(auto.id, 'worker_allow', 10000);
      expect(claimed).toBe(true);

      // Release claim
      await autoRepo.releaseClaim(auto.id, 'worker_allow', null);
      await db.automationExecution.delete({ where: { id: activeExec.id } });
    });

    it('advances nextRun without executing when missed policy is SKIP', async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const auto = await autoRepo.create({
        name: 'Missed Policy Skip Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'SCHEDULE',
        schedule: '10:00',
        actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Missed' } }],
        conditions: {
          _meta: {
            missedExecutionPolicy: 'SKIP',
            nextRunAt: pastTime,
            timezone: 'UTC',
          },
        },
      });
      createdAutomationIds.push(auto.id);

      const scheduler = new AutomationScheduler(db as any);
      await scheduler.recoverOnStartup();

      const refreshed = await autoRepo.findById(auto.id);
      const meta = (refreshed?.conditions as any)?._meta;
      // nextRunAt should have advanced past the old pastTime
      expect(meta.nextRunAt).not.toBe(pastTime);
      expect(new Date(meta.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ============================================================================
  // 4. REAL PHASE 4 AGENT & TOOL EXECUTION IN POSTGRESQL
  // ============================================================================
  describe('Phase 5.11 & 5.39: Real Phase 4 Tool Execution against PostgreSQL', () => {
    it('executes create_task action through Phase 4 toolExecutor and verifies live PostgreSQL task', async () => {
      const taskTitle = `Automated Scheduled Task - ${Date.now()}`;

      const result = (await actionEngine.executeAction(
        {
          type: 'create_task',
          params: {
            title: taskTitle,
            description: 'Created by automated Phase 5 scheduler',
            priority: 'high',
          },
        },
        {
          userId: tenantA_User,
          workspaceId: tenantA_Workspace,
          executionId: 'exec_test_task',
        },
      )) as any;

      expect(result).toBeDefined();
      expect(result.taskId).toBeDefined();
      createdTaskIds.push(result.taskId);

      // Verify real state in PostgreSQL database
      const savedTask = await db.task.findUnique({
        where: { id: result.taskId },
      });
      expect(savedTask).not.toBeNull();
      expect(savedTask?.title).toBe(taskTitle);
      expect(savedTask?.priority).toBe('HIGH');
    });

    it('executes analyze_project action and generates real metrics from PostgreSQL tasks', async () => {
      // 1. Create a project in PostgreSQL using Phase 4 tool
      const projResult = await toolExecutor.execute<{ projectId: string; name: string }>(
        'create_project',
        {
          name: `Phase 5 Project - ${Date.now()}`,
          description: 'Project created for scheduler analysis testing',
          priority: 'MEDIUM',
        },
        toolContextA,
      );
      expect(projResult.success).toBe(true);
      const projectId = projResult.data!.projectId;
      createdProjectIds.push(projectId);

      // 2. Create tasks under the project via create_task tool
      const t1Result = await toolExecutor.execute<{ taskId: string }>(
        'create_task',
        {
          title: 'Project Subtask 1',
          projectId,
          priority: 'medium',
        },
        toolContextA,
      );
      expect(t1Result.success).toBe(true);
      createdTaskIds.push(t1Result.data!.taskId);

      // Complete one task to give 50% completion
      await toolExecutor.execute(
        'complete_task',
        { taskId: t1Result.data!.taskId },
        toolContextA,
      );

      const t2Result = await toolExecutor.execute<{ taskId: string }>(
        'create_task',
        {
          title: 'Project Subtask 2',
          projectId,
          priority: 'low',
        },
        toolContextA,
      );
      expect(t2Result.success).toBe(true);
      createdTaskIds.push(t2Result.data!.taskId);

      // 3. Execute automated analysis through Phase 4 analyze_project action
      const report = (await actionEngine.executeAction(
        {
          type: 'analyze_project',
          params: { projectId },
        },
        {
          userId: tenantA_User,
          workspaceId: tenantA_Workspace,
          executionId: 'exec_test_proj',
        },
      )) as any;

      expect(report).toBeDefined();
      expect(report.projectId).toBe(projectId);
      expect(report.totalTasks).toBe(2);
      expect(report.completedTasks).toBe(1);
      expect(report.completionRate).toBe(50);
    });

    it('executes store_memory and search_memory actions with persistent memory recall', async () => {
      const memoryFact = `Automated user fact stored at ${Date.now()}`;

      // Store memory fact via authoritative tool
      const storeResult = await actionEngine.executeAction(
        {
          type: 'store_memory',
          params: {
            content: memoryFact,
            type: 'fact',
          },
        },
        {
          userId: tenantA_User,
          workspaceId: tenantA_Workspace,
          executionId: 'exec_test_mem_store',
        },
      );
      expect(storeResult).toBeDefined();

      // Search memory fact via authoritative tool
      const searchResult = (await actionEngine.executeAction(
        {
          type: 'search_memory',
          params: {
            query: memoryFact,
            limit: 3,
          },
        },
        {
          userId: tenantA_User,
          workspaceId: tenantA_Workspace,
          executionId: 'exec_test_mem_search',
        },
      )) as any;

      expect(searchResult).toBeDefined();
      expect(Array.isArray(searchResult.memories)).toBe(true);
      const match = searchResult.memories.find((m: any) => m.content.includes(memoryFact));
      expect(match).toBeDefined();
    });

    it('executes summarize_document action against knowledge document stored in PostgreSQL', async () => {
      // 1. Add knowledge document via Phase 4 authoritative tool
      const addDocResult = await toolExecutor.execute<{ documentId: string; title: string }>(
        'add_knowledge_document',
        {
          title: 'Phase 5 Infrastructure Architecture Doc',
          content: 'AETHER Phase 5 background scheduler runs database-first without requiring an open browser tab.',
          category: 'Architecture',
        },
        toolContextA,
      );
      expect(addDocResult.success).toBe(true);
      const docId = addDocResult.data!.documentId;
      createdDocIds.push(docId);

      // 2. Execute automated summarize_document action
      const summaryResult = (await actionEngine.executeAction(
        {
          type: 'summarize_document',
          params: {
            documentId: docId,
            maxLength: 300,
          },
        },
        {
          userId: tenantA_User,
          workspaceId: tenantA_Workspace,
          executionId: 'exec_test_rag_summary',
        },
      )) as any;

      expect(summaryResult).toBeDefined();
      expect(summaryResult.documentId).toBe(docId);
      expect(summaryResult.summary).toContain('Phase 5');
    });
  });

  // ============================================================================
  // 5. CONFIRMATION GATES & HUMAN APPROVAL
  // ============================================================================
  describe('Phase 5.14: Human Confirmation Gates & Approval Workflow', () => {
    it('halts execution at NEEDS_APPROVAL for high-impact tools without confirmation', async () => {
      // Create a task to delete via tool
      const tResult = await toolExecutor.execute<{ taskId: string }>(
        'create_task',
        { title: 'Task to be deleted with approval', priority: 'medium' },
        toolContextA,
      );
      expect(tResult.success).toBe(true);
      const taskId = tResult.data!.taskId;
      createdTaskIds.push(taskId);

      const auto = await autoRepo.create({
        name: 'High Impact Approval Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        actions: [{ type: 'delete_task', params: { taskId } }],
      });
      createdAutomationIds.push(auto.id);

      // Execute without confirmation token
      const res = await executionEngine.execute(auto.id, {}, tenantA_User);

      // Execution status must transition to NEEDS_APPROVAL, NOT executed!
      expect(res.status).toBe(AutomationStatus.NEEDS_APPROVAL);

      // Task must still exist in PostgreSQL!
      const stillExists = await db.task.findUnique({ where: { id: taskId } });
      expect(stillExists).not.toBeNull();
    });

    it('resumes and completes execution when approved by authorized user', async () => {
      // Create task via tool
      const tResult = await toolExecutor.execute<{ taskId: string }>(
        'create_task',
        { title: 'Task for approved deletion', priority: 'low' },
        toolContextA,
      );
      expect(tResult.success).toBe(true);
      const taskId = tResult.data!.taskId;
      createdTaskIds.push(taskId);

      const auto = await autoRepo.create({
        name: 'Approval Resumption Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        actions: [{ type: 'delete_task', params: { taskId } }],
      });
      createdAutomationIds.push(auto.id);

      // 1. Initial run enters NEEDS_APPROVAL
      const run1 = await executionEngine.execute(auto.id, {}, tenantA_User);
      expect(run1.status).toBe(AutomationStatus.NEEDS_APPROVAL);
      const executionId = run1.executionId;

      // 2. Execute with confirmation token (as approveExecution does)
      const approvedResult = await executionEngine.execute(
        auto.id,
        { confirmationToken: `token_approved_${tenantA_User}` },
        tenantA_User,
        executionId,
      );

      expect(approvedResult.status).toBe(AutomationStatus.COMPLETED);

      // 3. Task is now deleted from PostgreSQL (soft-deleted with deletedAt)
      const activeTask = await db.task.findFirst({ where: { id: taskId, deletedAt: null } });
      expect(activeTask).toBeNull();
      const deletedTask = await db.task.findUnique({ where: { id: taskId } });
      expect(deletedTask?.deletedAt).not.toBeNull();
    });
  });

  // ============================================================================
  // 6. CANCELLATION, TIMEOUT & CIRCUIT BREAKER
  // ============================================================================
  describe('Phase 5.19, 5.25 & 5.34: Cancellation, Timeouts and Circuit Breaker', () => {
    it('cancels active execution via cancelExecution without leaking state', async () => {
      const auto = await autoRepo.create({
        name: 'Cancellation Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        actions: [{ type: 'create_task', params: { title: 'Cancelled task' } }],
      });
      createdAutomationIds.push(auto.id);

      const exec = await execRepo.createExecution({
        automationId: auto.id,
        status: AutomationStatus.RUNNING,
        startedAt: new Date(),
      });

      const cancelled = await executionEngine.cancelExecution(exec.id, tenantA_User);
      expect(cancelled).toBe(true);

      const updated = await execRepo.findById(exec.id);
      expect(updated?.status).toBe(AutomationStatus.CANCELLED);

      // Clean up
      await db.automationExecution.delete({ where: { id: exec.id } });
    });

    it('auto-pauses automation when consecutive failures reach circuit breaker threshold', async () => {
      const auto = await autoRepo.create({
        name: 'Circuit Breaker Auto-Pause Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        actions: [{ type: 'INVALID_NON_EXISTENT_TOOL', params: {} }],
        conditions: {
          _meta: {
            circuitBreaker: {
              consecutiveFailures: 4, // 1 away from default threshold of 5
              failureThreshold: 5,
              autoPaused: false,
            },
          },
        },
      });
      createdAutomationIds.push(auto.id);

      // Trigger 5th failing execution
      await executionEngine.execute(auto.id, {}, tenantA_User);

      // Verify automation is now auto-paused in PostgreSQL
      const refreshed = await autoRepo.findById(auto.id);
      expect(refreshed?.status).toBe(AutomationStatus.PAUSED);
      expect(refreshed?.isEnabled).toBe(false);

      const meta = (refreshed?.conditions as any)?._meta;
      expect(meta.circuitBreaker.autoPaused).toBe(true);
      expect(meta.circuitBreaker.consecutiveFailures).toBeGreaterThanOrEqual(5);
    });

    it('sweeps and recovers stuck executions exceeding timeout threshold', async () => {
      const auto = await autoRepo.create({
        name: 'Stuck Execution Sweeper Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'SCHEDULE',
        actions: [{ type: 'create_task', params: { title: 'Stuck' } }],
      });
      createdAutomationIds.push(auto.id);

      // Create an orphaned RUNNING execution started 2 hours ago
      const stuckExec = await execRepo.createExecution({
        automationId: auto.id,
        status: AutomationStatus.RUNNING,
        startedAt: new Date(Date.now() - 7200000), // 2 hours ago
      });

      const scheduler = new AutomationScheduler(db as any);
      await scheduler.recoverOnStartup();

      // Sweeper must transition stuck execution to TIMED_OUT
      const recovered = await execRepo.findById(stuckExec.id);
      expect(recovered?.status).toBe(AutomationStatus.FAILED);
      expect((recovered?.error as any)?.code).toBe('TIMED_OUT');

      // Clean up
      await db.automationExecution.delete({ where: { id: stuckExec.id } });
    });
  });

  // ============================================================================
  // 7. SECURITY, TENANT BOUNDARIES & DELETED RESOURCES
  // ============================================================================
  describe('Phase 5.12, 5.13 & 5.29: Security, Tenant Boundaries & Deleted Resources', () => {
    it('prevents Tenant B from executing or viewing Tenant A automation', async () => {
      const service = new AutomationService(db as any);
      const auto = await autoRepo.create({
        name: 'Private Tenant A Automation',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Secret' } }],
      });
      createdAutomationIds.push(auto.id);

      // Tenant B tries to get Tenant A's automation
      await expect(service.getAutomationById(auto.id, tenantB_User)).rejects.toThrow(AppError);

      // Tenant B tries to manually trigger Tenant A's automation
      await expect(service.triggerAutomation(auto.id, tenantB_User)).rejects.toThrow(AppError);
    });

    it('fails gracefully with RESOURCE_NOT_FOUND when referenced resource is deleted', async () => {
      const fakeTaskId = '00000000-0000-4000-8000-000000000000';
      const auto = await autoRepo.create({
        name: 'Deleted Resource Test',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        actions: [{ type: 'complete_task', params: { taskId: fakeTaskId } }],
      });
      createdAutomationIds.push(auto.id);

      const res = await executionEngine.execute(auto.id, {}, tenantA_User);
      expect(res.status).toBe(AutomationStatus.FAILED);
      expect((res.result as any).error).toMatch(/not found/i);
    });

    it('prevents execution of disabled automations', async () => {
      const service = new AutomationService(db as any);
      const auto = await autoRepo.create({
        name: 'Disabled Rule',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        isEnabled: false,
        status: AutomationStatus.PAUSED,
        actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Disabled' } }],
      });
      createdAutomationIds.push(auto.id);

      await expect(service.triggerAutomation(auto.id, tenantA_User)).rejects.toThrowError(
        /disabled|paused/i,
      );
    });
  });

  // ============================================================================
  // 8. SCHEDULER HEALTH TELEMETRY & PERSISTENT NOTIFICATIONS
  // ============================================================================
  describe('Phase 5.23 & 5.33: Scheduler Health Telemetry & Notifications', () => {
    it('reports accurate operational health telemetry via getHealthStatus', async () => {
      const scheduler = new AutomationScheduler(db as any);
      const health = scheduler.getHealthStatus();

      expect(health.workerId).toBeDefined();
      expect(health.workerId).toMatch(/^worker_/);
      expect(health.pollIntervalMs).toBe(2000);
      expect(typeof health.isRunning).toBe('boolean');
      expect(typeof health.activeExecutions).toBe('number');
      expect(typeof health.totalExecuted).toBe('number');
      expect(typeof health.totalFailed).toBe('number');
      expect(health.lastPollAt).toBeDefined();
    });

    it('creates persistent notification in PostgreSQL upon automation completion', async () => {
      const auto = await autoRepo.create({
        name: 'Notification Test Automation',
        userId: tenantA_User,
        workspaceId: tenantA_Workspace,
        trigger: 'MANUAL',
        actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Alert Title', message: 'Alert content' } }],
      });
      createdAutomationIds.push(auto.id);

      await executionEngine.execute(auto.id, {}, tenantA_User);

      // Verify notification was created in PostgreSQL
      const notifs = await db.notification.findMany({
        where: { userId: tenantA_User, type: 'AUTOMATION' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs[0].title).toContain('Notification Test Automation');

      // Cleanup notification
      await db.notification.deleteMany({ where: { id: notifs[0].id } });
    });
  });
});
