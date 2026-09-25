import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationService } from '../../modules/automation/automation.service.js';
import { AutomationRepository } from '../../modules/automation/repositories/automation.repository.js';
import { ExecutionRepository } from '../../modules/automation/repositories/execution.repository.js';
import { ExecutionEngine } from '../../modules/automation/engine/execution-engine.js';
import { ActionEngine } from '../../modules/automation/engine/action-engine.js';
import { AutomationScheduler } from '../../modules/automation/scheduler/automation-scheduler.js';
import { withRetry, isRetryableError } from '../../modules/automation/utils/retry.utils.js';
import { db } from '../../database/client.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AutomationStatus } from '@prisma/client';
import { DataSanitizer } from '../../modules/ai/observability/sanitizer.js';
import { ErrorTaxonomy } from '../../modules/ai/observability/error-taxonomy.js';
import { userAwareKeyGenerator } from '../../middleware/rateLimit.middleware.js';
import { cronScheduler } from '../../cron/scheduler.js';

describe('Batch 7: Automation, Rate Limiting, Observability & Operational Reliability', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const workspaceA = '33333333-3333-4333-8333-333333333333';
  const workspaceB = '44444444-4444-4444-8444-444444444444';
  const autoId1 = '55555555-5555-4555-8555-555555555555';
  const autoId2 = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. AUTOMATION AUTHORIZATION & TENANT ISOLATION
  // ==========================================================================
  describe('1. Automation Authorization & Tenant Isolation', () => {
    let service: AutomationService;
    let repo: AutomationRepository;

    beforeEach(() => {
      service = new AutomationService(db as any);
      repo = new AutomationRepository();
    });

    it('rejects automation creation when unauthenticated (missing valid userId)', async () => {
      await expect(
        service.createAutomation({
          name: 'Unauthorized Rule',
          trigger: 'MANUAL',
          actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Test' } }],
          userId: undefined,
        }),
      ).rejects.toThrow(AppError);
    });

    it('rejects automation creation when caller is not a member of target workspace', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(
        service.createAutomation({
          name: 'Cross Tenant Rule',
          trigger: 'MANUAL',
          workspaceId: workspaceB,
          userId: userA,
          actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Test' } }],
        }),
      ).rejects.toThrowError(/Caller is not a member of the target workspace/);
    });

    it('rejects cross-tenant automation access (User B cannot read User A private automation)', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Private Automation',
        userId: userA,
        workspaceId: workspaceA,
        deletedAt: null,
      } as any);

      // User B is not a member of workspace A
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(service.getAutomationById(autoId1, userB)).rejects.toThrow(AppError);
    });

    it('rejects accessing deleted automations via getAutomationById', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue(null as any);

      await expect(service.getAutomationById(autoId1, userA)).rejects.toThrow(AppError);
    });

    it('filters findByWorkspaceId strictly by workspaceId and excludes deleted', async () => {
      const countSpy = vi.spyOn(db.automation, 'count').mockResolvedValue(1);
      const findManySpy = vi.spyOn(db.automation, 'findMany').mockResolvedValue([
        { id: autoId1, workspaceId: workspaceA, name: 'Rule 1', deletedAt: null },
      ] as any);

      const res = await repo.findByWorkspaceId(workspaceA);
      expect(res.items.length).toBe(1);
      expect(countSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: workspaceA, deletedAt: null }),
        }),
      );
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: workspaceA, deletedAt: null }),
        }),
      );
    });

    it('filters findByUserId strictly by userId and excludes deleted', async () => {
      const countSpy = vi.spyOn(db.automation, 'count').mockResolvedValue(1);
      const findManySpy = vi.spyOn(db.automation, 'findMany').mockResolvedValue([
        { id: autoId1, userId: userA, name: 'Rule 1', deletedAt: null },
      ] as any);

      const res = await repo.findByUserId(userA);
      expect(res.items.length).toBe(1);
      expect(countSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: userA, deletedAt: null }),
        }),
      );
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: userA, deletedAt: null }),
        }),
      );
    });
  });

  // ==========================================================================
  // 2. AUTOMATION EXECUTION SAFETY & LIFECYCLE
  // ==========================================================================
  describe('2. Automation Execution Safety & Lifecycle', () => {
    let service: AutomationService;
    let engine: ExecutionEngine;

    beforeEach(() => {
      service = new AutomationService(db as any);
      engine = new ExecutionEngine(db as any);
    });

    it('prevents execution of disabled automations', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Disabled Rule',
        userId: userA,
        workspaceId: workspaceA,
        isEnabled: false,
        status: AutomationStatus.ACTIVE,
        deletedAt: null,
      } as any);

      await expect(service.runAutomation(autoId1, {}, userA)).rejects.toThrowError(
        /Cannot execute disabled automation/,
      );
    });

    it('prevents execution of paused automations', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Paused Rule',
        userId: userA,
        workspaceId: workspaceA,
        isEnabled: true,
        status: AutomationStatus.PAUSED,
        deletedAt: null,
      } as any);

      await expect(service.runAutomation(autoId1, {}, userA)).rejects.toThrowError(
        /Cannot execute paused automation/,
      );
    });

    it('prevents execution of deleted automations', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Deleted Rule',
        userId: userA,
        workspaceId: workspaceA,
        isEnabled: true,
        status: AutomationStatus.ACTIVE,
        deletedAt: new Date(),
      } as any);

      await expect(service.runAutomation(autoId1, {}, userA)).rejects.toThrowError(
        /Cannot execute deleted automation/,
      );
    });

    it('truthfully reports failure when an action step fails and continueOnError is false', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Failing Rule',
        userId: userA,
        workspaceId: workspaceA,
        isEnabled: true,
        status: AutomationStatus.ACTIVE,
        actions: [{ type: 'TASK_CREATE', params: { title: 'Broken Task' } }],
        deletedAt: null,
      } as any);

      vi.spyOn(db.automationExecution, 'create').mockResolvedValue({
        id: '77777777-7777-4777-8777-777777777777',
        automationId: autoId1,
        startedAt: new Date(),
      } as any);

      const updateExecSpy = vi
        .spyOn(db.automationExecution, 'update')
        .mockResolvedValue({} as any);
      vi.spyOn(db.automationActivity, 'create').mockResolvedValue({} as any);
      vi.spyOn(db.automation, 'update').mockResolvedValue({} as any);

      // Simulate action engine step throwing
      vi.spyOn(ActionEngine.prototype, 'executeAction').mockRejectedValue(
        new Error('Database write constraint violation'),
      );

      const result = await engine.execute(autoId1, {}, userA);

      expect(result.status).toBe(AutomationStatus.FAILED);
      expect((result.result as any).error).toContain('Database write constraint violation');
      expect(updateExecSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AutomationStatus.FAILED }),
        }),
      );
    });
  });

  // ==========================================================================
  // 3. CONCURRENCY & IDEMPOTENCY SAFETY
  // ==========================================================================
  describe('3. Concurrency & Idempotency Safety', () => {
    let engine: ExecutionEngine;

    beforeEach(() => {
      engine = new ExecutionEngine(db as any);
    });

    it('blocks concurrent execution of the same automation rule with 409 CONFLICT', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Long Running Rule',
        userId: userA,
        workspaceId: workspaceA,
        isEnabled: true,
        status: AutomationStatus.ACTIVE,
        actions: [{ type: 'AI_SUMMARIZE', params: { text: 'summary' } }],
        deletedAt: null,
      } as any);

      vi.spyOn(db.automationExecution, 'create').mockResolvedValue({
        id: '88888888-8888-4888-8888-888888888888',
        automationId: autoId1,
        startedAt: new Date(),
      } as any);
      vi.spyOn(db.automationExecution, 'update').mockResolvedValue({} as any);
      vi.spyOn(db.automationActivity, 'create').mockResolvedValue({} as any);
      vi.spyOn(db.automation, 'update').mockResolvedValue({} as any);

      // Make step execution hang for 100ms
      vi.spyOn(ActionEngine.prototype, 'executeAction').mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('done'), 100)),
      );

      // First execution starts and acquires lock
      const run1Promise = engine.execute(autoId1, {}, userA);

      // Second simultaneous execution on same automation rule must be rejected with 409 CONFLICT
      await expect(engine.execute(autoId1, {}, userA)).rejects.toThrowError(
        /already running an active execution/,
      );

      await run1Promise;
    });

    it('deduplicates duplicate requests with the same idempotencyKey within 60 seconds', async () => {
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Idempotent Rule',
        userId: userA,
        workspaceId: workspaceA,
        isEnabled: true,
        status: AutomationStatus.ACTIVE,
        actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Alert' } }],
        deletedAt: null,
      } as any);

      vi.spyOn(db.automationExecution, 'create').mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        automationId: autoId1,
        startedAt: new Date(),
      } as any);
      vi.spyOn(db.automationExecution, 'update').mockResolvedValue({} as any);
      vi.spyOn(db.automationActivity, 'create').mockResolvedValue({} as any);
      vi.spyOn(db.automation, 'update').mockResolvedValue({} as any);

      const actionSpy = vi
        .spyOn(ActionEngine.prototype, 'executeAction')
        .mockResolvedValue({ notified: true });

      const idempotencyKey = 'idem_key_unique_12345';

      // First run executes actions
      const res1 = await engine.execute(autoId1, { idempotencyKey }, userA);
      expect(res1.status).toBe(AutomationStatus.COMPLETED);
      expect(actionSpy).toHaveBeenCalledTimes(1);

      // Second run within 60s with identical key returns cached result without re-executing
      const res2 = await engine.execute(autoId1, { idempotencyKey }, userA);
      expect(res2.status).toBe(AutomationStatus.COMPLETED);
      expect(res2.executionId).toBe(res1.executionId);
      // Action was NOT executed again
      expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects oversized automation action pipelines (>20 actions)', async () => {
      const excessiveActions = Array.from({ length: 25 }, (_, i) => ({
        type: 'NOTIFICATION_CREATE',
        params: { title: `Step ${i}` },
      }));

      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId1,
        name: 'Runaway Automation',
        userId: userA,
        workspaceId: workspaceA,
        isEnabled: true,
        status: AutomationStatus.ACTIVE,
        actions: excessiveActions,
        deletedAt: null,
      } as any);

      vi.spyOn(db.automationExecution, 'create').mockResolvedValue({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        automationId: autoId1,
        startedAt: new Date(),
      } as any);
      vi.spyOn(db.automationExecution, 'update').mockResolvedValue({} as any);
      vi.spyOn(db.automationActivity, 'create').mockResolvedValue({} as any);
      vi.spyOn(db.automation, 'update').mockResolvedValue({} as any);

      const res = await engine.execute(autoId1, {}, userA);
      expect(res.status).toBe(AutomationStatus.FAILED);
      expect((res.result as any).error).toContain('exceeding maximum safety bound');
    });
  });

  // ==========================================================================
  // 4. RETRY & BACKOFF DISCRIMINATION
  // ==========================================================================
  describe('4. Retry & Backoff Discrimination', () => {
    it('identifies permanent validation, auth, and 404 errors as non-retryable', () => {
      expect(isRetryableError(new AppError('Validation failed', 400, 'VALIDATION_ERROR'))).toBe(
        false,
      );
      expect(isRetryableError(new AppError('Unauthorized', 401, 'AUTHENTICATION_ERROR'))).toBe(
        false,
      );
      expect(isRetryableError(new AppError('Forbidden', 403, 'AUTHORIZATION_ERROR'))).toBe(false);
      expect(isRetryableError(new AppError('Not Found', 404, 'NOT_FOUND'))).toBe(false);
      expect(isRetryableError(new AppError('Conflict', 409, 'CONFLICT'))).toBe(false);
      expect(isRetryableError(new Error('Item not found in workspace'))).toBe(false);
      expect(isRetryableError(new Error('Permission denied for resource'))).toBe(false);
    });

    it('identifies transient network and timeout errors as retryable', () => {
      expect(isRetryableError(new Error('Connection reset by peer ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('ETIMEDOUT: Gateway request timed out'))).toBe(true);
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
    });

    it('aborts retry immediately on non-retryable failure without looping', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        throw new AppError('Forbidden: Access denied', 403, 'FORBIDDEN');
      });

      await expect(withRetry('non_retryable_test', fn, { maxRetries: 3 })).rejects.toThrow(
        'Forbidden: Access denied',
      );
      // Stopped on the very first attempt!
      expect(attempts).toBe(1);
    });

    it('retries transient failures and succeeds on recovery', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary connection dropped');
        }
        return 'recovered_payload';
      });

      const result = await withRetry('transient_recovery_test', fn, {
        maxRetries: 2,
        initialDelayMs: 5,
      });
      expect(result).toBe('recovered_payload');
      expect(attempts).toBe(2);
    });

    it('respects abortSignal cancellation', async () => {
      const controller = new AbortController();
      controller.abort();

      const fn = vi.fn(async () => 'never_reached');
      await expect(
        withRetry('abort_test', fn, { abortSignal: controller.signal }),
      ).rejects.toThrow(/cancelled before completion/);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 5. SERVER-AUTHORITATIVE IDENTITY IN ACTIONS
  // ==========================================================================
  describe('5. Server-Authoritative Identity in Actions', () => {
    let actionEngine: ActionEngine;

    beforeEach(() => {
      actionEngine = new ActionEngine(db as any);
    });

    it('enforces context.workspaceId and context.userId over spoofed action params in project create', async () => {
      const spoofedParams = {
        name: 'Spoofed Project',
        workspaceId: workspaceB, // Attacker tries to inject Workspace B
        ownerId: userB, // Attacker tries to claim User B ownership
      };

      const verifiedContext = {
        workspaceId: workspaceA,
        userId: userA,
      };

      const projectCreateSpy = vi.spyOn(db.project, 'create').mockResolvedValue({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Spoofed Project',
        workspaceId: workspaceA,
        ownerId: userA,
      } as any);

      await actionEngine.executeAction(
        { type: 'PROJECT_CREATE', params: spoofedParams },
        verifiedContext,
      );

      // Database write must use the authenticated context, NOT the spoofed params!
      expect(projectCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: workspaceA,
            ownerId: userA,
          }),
        }),
      );
    });

    it('enforces context.userId over spoofed params in notification actions', async () => {
      const spoofedParams = {
        userId: userB,
        title: 'Spoofed Alert',
      };

      const verifiedContext = {
        workspaceId: workspaceA,
        userId: userA,
      };

      const notifyCreateSpy = vi.spyOn(db.notification, 'create').mockResolvedValue({} as any);

      await actionEngine.executeAction(
        { type: 'NOTIFICATION_CREATE', params: spoofedParams },
        verifiedContext,
      );

      expect(notifyCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: userA, // Bound to authenticated caller
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // 6. OBSERVABILITY & SENSITIVE DATA REDACTION
  // ==========================================================================
  describe('6. Observability & Sensitive Data Redaction', () => {
    it('redacts passwords, tokens, API keys, and connection strings from telemetry', () => {
      const sensitivePayload = {
        username: 'admin',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.fake_signature',
        apiKey: 'sk-1234567890abcdef1234567890abcdef',
        database_url: 'postgresql://postgres:secretpassword@localhost:5432/aether',
        nested: {
          authHeader: 'Bearer my-secret-jwt-token',
          safeField: 'Hello World',
        },
      };

      const sanitized = DataSanitizer.sanitize(sensitivePayload);

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.database_url).toBe('[REDACTED_URI]');
      expect(sanitized.nested.authHeader).toBe('Bearer [REDACTED]');
      expect(sanitized.nested.safeField).toBe('Hello World');
    });

    it('maps automation errors to CanonicalError codes without leaking internal stack traces', () => {
      const timeoutErr = new AppError('Action step timed out', 504, 'TIMEOUT');
      const canonicalTimeout = ErrorTaxonomy.classify(timeoutErr);
      expect(canonicalTimeout.code).toBe('TIMEOUT');
      expect(canonicalTimeout.statusCode).toBe(504);

      const conflictErr = new AppError('Active execution already running', 409, 'CONFLICT');
      const canonicalConflict = ErrorTaxonomy.classify(conflictErr);
      expect(canonicalConflict.code).toBe('CONFLICT');
      expect(canonicalConflict.statusCode).toBe(409);

      const safeJson = canonicalTimeout.toSafeJSON();
      expect(safeJson).not.toHaveProperty('stack');
      expect(safeJson.error).toHaveProperty('code', 'TIMEOUT');
    });
  });

  // ==========================================================================
  // 7. BACKGROUND & SCHEDULED EXECUTION SAFETY
  // ==========================================================================
  describe('7. Background & Scheduled Execution Safety', () => {
    let scheduler: AutomationScheduler;

    beforeEach(() => {
      scheduler = new AutomationScheduler(db as any);
    });

    it('unschedules task from cron scheduler if automation becomes deleted in database', async () => {
      const unscheduleSpy = vi.spyOn(cronScheduler, 'unschedule');
      let registeredHandler: any;

      vi.spyOn(cronScheduler, 'schedule').mockImplementation((def: any) => {
        registeredHandler = def.handler;
      });

      scheduler.scheduleAutomation(autoId1, 'Test Scheduled Rule', '0 * * * *');
      expect(registeredHandler).toBeDefined();

      // Database reports rule is now deleted
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue(null as any);

      // Trigger the scheduled handler
      await registeredHandler();

      // Verifies that the scheduler safely unscheduled the orphaned task
      expect(unscheduleSpy).toHaveBeenCalledWith(`automation_${autoId1}`);
    });

    it('unschedules task from cron scheduler if automation becomes disabled in database', async () => {
      const unscheduleSpy = vi.spyOn(cronScheduler, 'unschedule');
      let registeredHandler: any;

      vi.spyOn(cronScheduler, 'schedule').mockImplementation((def: any) => {
        registeredHandler = def.handler;
      });

      scheduler.scheduleAutomation(autoId2, 'Rule To Disable', '0 12 * * *');
      expect(registeredHandler).toBeDefined();

      // Database reports rule was disabled
      vi.spyOn(db.automation, 'findFirst').mockResolvedValue({
        id: autoId2,
        isEnabled: false,
        status: AutomationStatus.PAUSED,
      } as any);

      await registeredHandler();
      expect(unscheduleSpy).toHaveBeenCalledWith(`automation_${autoId2}`);
    });
  });

  // ==========================================================================
  // 8. RATE LIMITING & ABUSE PROTECTION
  // ==========================================================================
  describe('8. Rate Limiting & Abuse Protection', () => {
    it('generates user-aware rate limit keys for authenticated sessions', () => {
      const reqAuth = {
        user: { id: userA },
        ip: '192.168.1.50',
      } as any;

      expect(userAwareKeyGenerator(reqAuth)).toBe(`user_${userA}`);
    });

    it('falls back to IP address for unauthenticated requests', () => {
      const reqAnon = {
        user: undefined,
        ip: '203.0.113.195',
      } as any;

      expect(userAwareKeyGenerator(reqAnon)).toBe('203.0.113.195');
    });
  });
});
