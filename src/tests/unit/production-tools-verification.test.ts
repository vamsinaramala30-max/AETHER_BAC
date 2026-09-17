/**
 * AETHER AI — Production Tools + Verified Actions Comprehensive Test Suite
 * Prompt 6 Authoritative Verification Suite
 *
 * Covers:
 * 1. Single Authoritative Tool Registry (dual-index, duplicate guard, public descriptors)
 * 2. Strict Input Validation & Pre-execution Schema Enforcement
 * 3. Server-side Tenant & Permission Isolation (A vs B cross-tenant denial)
 * 4. Execution Lifecycle States (PLANNED -> VALIDATING -> EXECUTING -> VERIFYING -> COMPLETED/FAILED/TIMED_OUT/DENIED/CANCELLED)
 * 5. Real PostgreSQL Database Verification (no simulated success, state verified before reporting)
 * 6. Task Tools, Note Tools, Memory Tools DB mutation and verification
 * 7. Action Audit Trail with credential sanitization & retrieval
 * 8. REST API Tools Controller endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { toolRegistry } from '../../modules/ai/tools/tool-registry.js';
import { toolExecutor } from '../../modules/ai/tools/tool-executor.js';
import { toolPermissions } from '../../modules/ai/tools/tool-permissions.js';
import { toolValidator } from '../../modules/ai/tools/tool-validator.js';
import { actionAuditLogger } from '../../modules/ai/audit/action-audit-logger.js';
import { toolsController } from '../../modules/ai/api/controllers/tools-controller.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
  AuthenticationContext,
} from '../../modules/ai/tools/tool-types.js';

// Auto-register all tool modules
import '../../modules/ai/tools/task-tools.js';
import '../../modules/ai/tools/project-tools.js';
import '../../modules/ai/tools/goal-tools.js';
import '../../modules/ai/tools/productivity-tools.js';
import '../../modules/ai/tools/automation-tools.js';
import '../../modules/ai/tools/workspace-tools.js';
import '../../modules/ai/tools/knowledge-tools.js';
import '../../modules/ai/tools/note-tools.js';
import '../../modules/ai/tools/memory-tools.js';

describe('Prompt 6 — Production Tools + Verified Actions Authoritative Suite', () => {
  const userAId = 'a1111111-1111-4111-a111-111111111111';
  const userBId = 'b2222222-2222-4222-b222-222222222222';
  const workspaceAId = 'w1111111-1111-4111-a111-111111111111';
  const workspaceBId = 'w2222222-2222-4222-b222-222222222222';

  const userAAuth: AuthenticationContext = {
    userId: userAId,
    sessionId: 'sess_user_a',
    roles: ['user'],
    permissions: [
      'tasks:read',
      'tasks:write',
      'knowledge:read',
      'knowledge:write',
      'memory:read',
      'memory:write',
      'projects:read',
      'projects:write',
    ],
    workspaceId: workspaceAId,
  };

  const userBAuth: AuthenticationContext = {
    userId: userBId,
    sessionId: 'sess_user_b',
    roles: ['user'],
    permissions: [
      'tasks:read',
      'tasks:write',
      'knowledge:read',
      'knowledge:write',
      'memory:read',
      'memory:write',
    ],
    workspaceId: workspaceBId,
  };

  const adminAuth: AuthenticationContext = {
    userId: 'd9999999-9999-4999-a999-999999999999',
    sessionId: 'sess_admin',
    roles: ['admin'],
    permissions: ['*'],
    workspaceId: workspaceAId,
  };

  const restrictedAuth: AuthenticationContext = {
    userId: 'e8888888-8888-4888-a888-888888888888',
    sessionId: 'sess_restricted',
    roles: ['guest'],
    permissions: ['tasks:read'], // Cannot write
    workspaceId: workspaceAId,
  };

  const makeContext = (auth: AuthenticationContext): ToolExecutionContext => ({
    auth,
    traceId: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    correlationId: `corr_${Date.now()}`,
    workspaceId: auth.workspaceId,
  });

  beforeEach(() => {
    toolExecutor.clearIdempotencyCache();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Tool Registry & Discovery
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Authoritative Tool Registry & Discovery', () => {
    it('1.1 should register and retrieve tools by name and by ID', () => {
      const taskTool = toolRegistry.get('create_task');
      expect(taskTool).toBeDefined();
      expect(taskTool?.name).toBe('create_task');
      expect(taskTool?.id).toBe('tool_create_task');

      const byId = toolRegistry.getById('tool_create_task');
      expect(byId).toBeDefined();
      expect(byId?.name).toBe('create_task');
    });

    it('1.2 should prevent duplicate registration without explicit override', () => {
      const dummyTool: ToolDefinition = {
        id: 'tool_custom_test_unique',
        name: 'custom_test_tool',
        description: 'Test tool',
        category: 'system',
        riskLevel: 'READ_ONLY',
        inputSchema: { type: 'object', properties: {} },
        requiredPermissions: ['system:read'],
        handler: async () => ({ status: 'ok' }),
      };

      toolRegistry.register(dummyTool, { override: true });
      expect(toolRegistry.has('custom_test_tool')).toBe(true);

      // Duplicate without override should throw
      expect(() => toolRegistry.register(dummyTool)).toThrow(/already registered/i);

      // Re-register with override: true should succeed
      expect(() => toolRegistry.register(dummyTool, { override: true })).not.toThrow();

      toolRegistry.unregister('custom_test_tool');
    });

    it('1.3 should list public tool descriptors without exposing raw handlers', () => {
      const descriptors = toolRegistry.list();
      expect(descriptors.length).toBeGreaterThanOrEqual(8);

      for (const desc of descriptors) {
        expect(desc.id).toBeDefined();
        expect(desc.name).toBeDefined();
        expect(desc.description).toBeDefined();
        expect(desc.inputSchema).toBeDefined();
        expect(desc.requiredPermissions).toBeDefined();
        expect(desc.riskLevel).toBeDefined();
        // Handlers must NEVER be present on public descriptors
        expect((desc as any).handler).toBeUndefined();
        expect((desc as any).verify).toBeUndefined();
      }
    });

    it('1.4 should filter tools by category and risk level', () => {
      const taskToolsList = toolRegistry.listByCategory('tasks');
      expect(taskToolsList.length).toBeGreaterThan(0);
      expect(taskToolsList.every((t) => t.category === 'tasks')).toBe(true);

      const highImpactTools = toolRegistry.listByRiskLevel('HIGH_IMPACT');
      expect(highImpactTools.length).toBeGreaterThan(0);
      expect(highImpactTools.every((t) => t.riskLevel === 'HIGH_IMPACT')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Strict Input Schema Validation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Input Schema Validation', () => {
    it('2.1 should reject execution if required parameters are missing', async () => {
      const ctx = makeContext(userAAuth);
      const res = await toolExecutor.execute('create_task', {} as any, ctx);

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_INPUT');
      expect(res.actionState).toBe('FAILED');
      expect(res.error).toMatch(/required/i);
    });

    it('2.2 should reject execution if parameter types do not match schema', async () => {
      const ctx = makeContext(userAAuth);
      const res = await toolExecutor.execute('create_task', { title: 12345 } as any, ctx);

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_INPUT');
      expect(res.error).toMatch(/string|type/i);
    });

    it('2.3 should accept valid conforming parameters', async () => {
      const validation = toolValidator.validate(
        { title: 'Valid conforming task title', priority: 'high' },
        toolRegistry.get('create_task')!.inputSchema,
      );
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Server-side Tenant & Permission Isolation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Tenant & Permission Isolation', () => {
    it('3.1 should reject execution if user lacks required permission', async () => {
      const ctx = makeContext(restrictedAuth); // Guest without tasks:write
      const res = await toolExecutor.execute(
        'create_task',
        { title: 'Unauthorized Task Creation' },
        ctx,
      );

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
      expect(res.actionState).toBe('DENIED');
      expect(res.error).toMatch(/Unauthorized/i);
    });

    it('3.2 should allow admin role to execute regardless of explicit permissions', async () => {
      const ctx = makeContext(adminAuth);
      const res = await toolExecutor.execute(
        'create_task',
        { title: 'Admin Authorized Task', priority: 'urgent' },
        ctx,
      );

      expect(res.success).toBe(true);
      expect(res.code).toBe('SUCCESS');
      expect(res.verified).toBe(true);
    });

    it('3.3 should support bidirectional aliases between canonical and namespace formats', () => {
      const check1 = toolPermissions.checkPermissions(['tasks:write'], {
        userId: 'u1',
        sessionId: 's1',
        roles: ['user'],
        permissions: ['TASK_CREATE'],
      });
      expect(check1.allowed).toBe(true);

      const check2 = toolPermissions.checkPermissions(['tasks:read'], {
        userId: 'u1',
        sessionId: 's1',
        roles: ['user'],
        permissions: ['TASK_READ'],
      });
      expect(check2.allowed).toBe(true);
    });

    it('3.4 should prevent User B from reading or modifying User A tasks (Tenant Isolation)', async () => {
      // Step 1: User A creates a task
      const ctxA = makeContext(userAAuth);
      const createRes = await toolExecutor.execute<{ taskId: string }>(
        'create_task',
        { title: "User A Confidential Task", priority: 'high' },
        ctxA,
      );
      expect(createRes.success).toBe(true);
      const taskId = createRes.data!.taskId;

      // Step 2: User B tries to read User A's task
      const ctxB = makeContext(userBAuth);
      const getRes = await toolExecutor.execute('get_task', { taskId }, ctxB);
      expect(getRes.success).toBe(false);
      expect(getRes.code).toBe('UNAUTHORIZED_RESOURCE');
      expect(getRes.actionState).toBe('DENIED');

      // Step 3: User B tries to update User A's task
      const updateRes = await toolExecutor.execute('update_task', { taskId, title: 'Tampered Title' }, ctxB);
      expect(updateRes.success).toBe(false);
      expect(updateRes.code).toBe('UNAUTHORIZED_RESOURCE');
      expect(updateRes.actionState).toBe('DENIED');

      // Step 4: User B tries to complete User A's task
      const completeRes = await toolExecutor.execute('complete_task', { taskId }, ctxB);
      expect(completeRes.success).toBe(false);
      expect(completeRes.code).toBe('UNAUTHORIZED_RESOURCE');
      expect(completeRes.actionState).toBe('DENIED');

      // Step 5: User B tries to delete User A's task
      const deleteRes = await toolExecutor.execute('delete_task', { taskId }, ctxB);
      expect(deleteRes.success).toBe(false);
      expect(deleteRes.code).toBe('UNAUTHORIZED_RESOURCE');
      expect(deleteRes.actionState).toBe('DENIED');
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Execution Lifecycle States, Timeouts, Cancellation & Idempotency
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Lifecycle States, Timeouts & Idempotency', () => {
    it('4.1 should include execution metadata, duration, and correlation ID', async () => {
      const ctx = makeContext(userAAuth);
      const res = await toolExecutor.execute(
        'create_task',
        { title: 'Metadata test task' },
        ctx,
      );

      expect(res.success).toBe(true);
      expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(res.actionState).toBe('COMPLETED');
      expect(res.metadata).toBeDefined();
      expect(res.metadata?.toolId).toBe('tool_create_task');
      expect(res.metadata?.executionId).toBeDefined();
      expect(res.metadata?.correlationId).toBe(ctx.correlationId);
    });

    it('4.2 should enforce timeout policy with TIMEOUT code and TIMED_OUT state', async () => {
      const slowTool: ToolDefinition = {
        id: 'tool_slow_operation',
        name: 'slow_operation',
        description: 'Simulates slow execution',
        category: 'system',
        riskLevel: 'READ_ONLY',
        inputSchema: { type: 'object', properties: {} },
        requiredPermissions: ['tasks:read'],
        timeoutMs: 50,
        handler: async () => {
          await new Promise((r) => setTimeout(r, 200));
          return { done: true };
        },
      };

      toolRegistry.register(slowTool, { override: true });
      const ctx = makeContext(userAAuth);

      const res = await toolExecutor.execute('slow_operation', {}, ctx, { timeoutMs: 30 });
      expect(res.success).toBe(false);
      expect(res.code).toBe('TIMEOUT');
      expect(res.actionState).toBe('TIMED_OUT');

      toolRegistry.unregister('slow_operation');
    });

    it('4.3 should abort on cancellation signal with CANCELLED code and state', async () => {
      const controller = new AbortController();
      controller.abort(); // Pre-aborted

      const ctx = makeContext(userAAuth);
      const res = await toolExecutor.execute(
        'create_task',
        { title: 'Cancelled task' },
        ctx,
        { signal: controller.signal },
      );

      expect(res.success).toBe(false);
      expect(res.code).toBe('CANCELLED');
      expect(res.actionState).toBe('CANCELLED');
    });

    it('4.4 should cache idempotent executions and return cached: true', async () => {
      const ctx = makeContext(userAAuth);
      const idempotencyKey = `idem_${Date.now()}_${Math.random()}`;

      const res1 = await toolExecutor.execute(
        'create_task',
        { title: 'Idempotent Task' },
        ctx,
        { idempotencyKey },
      );
      expect(res1.success).toBe(true);
      expect(res1.cached).toBeUndefined();

      const res2 = await toolExecutor.execute(
        'create_task',
        { title: 'Idempotent Task' },
        ctx,
        { idempotencyKey },
      );
      expect(res2.success).toBe(true);
      expect(res2.cached).toBe(true);
      expect((res2.data as any).taskId).toBe((res1.data as any).taskId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Real PostgreSQL State Verification (No Simulated Success)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('5. Real Database State Verification & Mutation', () => {
    it('5.1 should create a task in DB and verify persistent state', async () => {
      const ctx = makeContext(userAAuth);
      const title = `Verified Task ${Date.now()}`;

      const createRes = await toolExecutor.execute<{ taskId: string; status: string }>(
        'create_task',
        { title, priority: 'medium' },
        ctx,
      );

      expect(createRes.success).toBe(true);
      expect(createRes.verified).toBe(true);
      expect(createRes.verificationStatus).toBe('VERIFIED');
      expect(createRes.verificationDetails).toContain(title);
      expect(createRes.data?.taskId).toBeDefined();

      const taskId = createRes.data!.taskId;

      // Complete the task and verify state changes in DB
      const completeRes = await toolExecutor.execute<{ isCompleted: boolean; status: string }>(
        'complete_task',
        { taskId },
        ctx,
      );

      expect(completeRes.success).toBe(true);
      expect(completeRes.verified).toBe(true);
      expect(completeRes.data?.isCompleted).toBe(true);
      expect(completeRes.data?.status).toBe('DONE');

      // Delete the task and verify absence from DB
      const deleteRes = await toolExecutor.execute<{ deleted: boolean }>(
        'delete_task',
        { taskId },
        ctx,
      );

      expect(deleteRes.success).toBe(true);
      expect(deleteRes.verified).toBe(true);
      expect(deleteRes.data?.deleted).toBe(true);

      // Verify task cannot be retrieved anymore
      const verifyAbsence = await toolExecutor.execute('get_task', { taskId }, ctx);
      expect(verifyAbsence.success).toBe(false);
      expect(verifyAbsence.error).toMatch(/not found/i);
    }, 90000);

    it('5.2 should fail verification if backend database state does not match expected output', async () => {
      // Create a test tool with an intentional verification failure
      const defectTool: ToolDefinition = {
        id: 'tool_defective_verification',
        name: 'defective_verification',
        description: 'Simulates verification failure',
        category: 'system',
        riskLevel: 'MODIFY',
        inputSchema: { type: 'object', properties: { val: { type: 'string' } } },
        requiredPermissions: ['tasks:write'],
        handler: async () => ({ applied: true }),
        verify: async () => ({
          verified: false,
          error: 'State mismatch: DB row not updated to expected value.',
        }),
      };

      toolRegistry.register(defectTool, { override: true });
      const ctx = makeContext(userAAuth);

      const res = await toolExecutor.execute('defective_verification', { val: 'test' }, ctx);
      expect(res.success).toBe(false);
      expect(res.code).toBe('VERIFICATION_FAILED');
      expect(res.verified).toBe(false);
      expect(res.actionState).toBe('FAILED');
      expect(res.error).toContain('State mismatch');

      toolRegistry.unregister('defective_verification');
    });

    it('5.3 should create, update, and delete notes with real DB verification', async () => {
      const ctx = makeContext(userAAuth);
      const noteTitle = `Project Architecture Note ${Date.now()}`;
      const noteContent = `# Architecture\nReal verified documentation.`;

      // Create Note
      const createRes = await toolExecutor.execute<{ noteId: string; title: string }>(
        'create_note',
        { title: noteTitle, content: noteContent, category: 'Engineering' },
        ctx,
      );

      expect(createRes.success).toBe(true);
      expect(createRes.verified).toBe(true);
      expect(createRes.data?.noteId).toBeDefined();

      const noteId = createRes.data!.noteId;

      // Update Note
      const updatedTitle = `${noteTitle} (v2)`;
      const updateRes = await toolExecutor.execute<{ noteId: string; updated: boolean }>(
        'update_note',
        { noteId, title: updatedTitle, content: 'Revised content.' },
        ctx,
      );

      expect(updateRes.success).toBe(true);
      expect(updateRes.verified).toBe(true);

      // Delete Note
      const deleteRes = await toolExecutor.execute<{ noteId: string; deleted: boolean }>(
        'delete_note',
        { noteId },
        ctx,
      );

      expect(deleteRes.success).toBe(true);
      expect(deleteRes.verified).toBe(true);

      // Verify note is gone
      const getDeleted = await toolExecutor.execute('get_note', { noteId }, ctx);
      expect(getDeleted.success).toBe(false);
    }, 60000);

    it('5.4 should store, recall, and forget persistent memory items with real verification', async () => {
      const ctx = makeContext(userAAuth);
      const fact = `User prefers dark mode and TypeScript for all backend code ${Date.now()}`;

      // Store Memory
      const storeRes = await toolExecutor.execute<{ memoryId: string; content: string }>(
        'store_memory',
        { content: fact, type: 'preference', importance: 8 },
        ctx,
      );

      expect(storeRes.success).toBe(true);
      expect(storeRes.verified).toBe(true);
      expect(storeRes.data?.memoryId).toBeDefined();

      const memoryId = storeRes.data!.memoryId;

      // Recall Memory
      const recallRes = await toolExecutor.execute<{ memories: any[]; total: number }>(
        'recall_memory',
        { query: 'dark mode TypeScript' },
        ctx,
      );

      expect(recallRes.success).toBe(true);
      expect(recallRes.data?.memories.length).toBeGreaterThan(0);

      // Forget Memory
      const forgetRes = await toolExecutor.execute<{ memoryId: string; forgotten: boolean }>(
        'forget_memory',
        { memoryId },
        ctx,
      );

      expect(forgetRes.success).toBe(true);
      expect(forgetRes.verified).toBe(true);
      expect(forgetRes.data?.forgotten).toBe(true);
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Action Audit Trail Logging & Sanitization
  // ═══════════════════════════════════════════════════════════════════════════
  describe('6. Action Audit Logging & Sanitization', () => {
    it('6.1 should sanitize sensitive keys like passwords and tokens in audit inputs', async () => {
      const sensitiveTool: ToolDefinition = {
        id: 'tool_sensitive_test',
        name: 'sensitive_test',
        description: 'Test sensitive input sanitization',
        category: 'system',
        riskLevel: 'READ_ONLY',
        inputSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
            password: { type: 'string' },
            safeField: { type: 'string' },
          },
        },
        requiredPermissions: ['tasks:read'],
        handler: async () => ({ processed: true }),
      };

      toolRegistry.register(sensitiveTool, { override: true });
      const ctx = makeContext(userAAuth);

      await toolExecutor.execute(
        'sensitive_test',
        { apiKey: 'sk-1234567890', password: 'secretPassword123', safeField: 'safeValue' },
        ctx,
      );

      const logs = await actionAuditLogger.getLogs({ toolName: 'sensitive_test', limit: 1 });
      expect(logs.length).toBe(1);
      const log = logs[0]!;
      expect(log.input.apiKey).toBe('[REDACTED]');
      expect(log.input.password).toBe('[REDACTED]');
      expect(log.input.safeField).toBe('safeValue');

      toolRegistry.unregister('sensitive_test');
    });

    it('6.2 should retrieve audit logs by execution ID', async () => {
      const ctx = makeContext(userAAuth);
      const res = await toolExecutor.execute(
        'create_task',
        { title: 'Audited Task Creation' },
        ctx,
      );

      expect(res.metadata?.executionId).toBeDefined();
      const executionId = res.metadata!.executionId;

      const log = await actionAuditLogger.getLogById(executionId);
      expect(log).toBeDefined();
      expect(log?.toolName).toBe('create_task');
      expect(log?.verified).toBe(true);
    }, 60000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Tools REST API Controller
  // ═══════════════════════════════════════════════════════════════════════════
  describe('7. Tools REST API Controller', () => {
    it('7.1 should list tools and filter by category via controller', async () => {
      const listRes = await toolsController.listTools();
      expect(listRes.success).toBe(true);
      expect(listRes.data.length).toBeGreaterThan(0);

      const catRes = await toolsController.listTools({ category: 'tasks' });
      expect(catRes.success).toBe(true);
      expect(catRes.data.every((t: any) => t.category === 'tasks')).toBe(true);
    });

    it('7.2 should get single tool metadata via controller', async () => {
      const res = await toolsController.getTool('create_task');
      expect(res.success).toBe(true);
      expect((res as any).data.name).toBe('create_task');
      expect((res as any).data.inputSchema).toBeDefined();

      const notFound = await toolsController.getTool('non_existent_tool_xyz');
      expect(notFound.success).toBe(false);
      expect((notFound as any).error.code).toBe('NOT_FOUND');
    });

    it('7.3 should execute tool via controller and return verified execution result', async () => {
      const res = await toolsController.executeTool(
        'create_task',
        { title: 'API Executed Task', priority: 'medium' },
        userAAuth,
        { correlationId: 'api_corr_123' },
      );

      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);
      expect(res.actionState).toBe('COMPLETED');
      expect(res.metadata?.correlationId).toBe('api_corr_123');
    }, 60000);

    it('7.4 should retrieve audit execution history via controller', async () => {
      const execs = await toolsController.getExecutions({ userId: userAId, limit: 10 });
      expect(execs.success).toBe(true);
      expect(Array.isArray(execs.data)).toBe(true);
    });
  });
});
