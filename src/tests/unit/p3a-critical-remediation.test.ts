import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client.js';
import { TasksService } from '../../modules/projects/tasks/tasks.service.js';
import { TasksRepository } from '../../modules/projects/tasks/tasks.repository.js';
import { TasksController } from '../../modules/projects/tasks/tasks.controller.js';
import { SyncService, SyncProvider, SyncStatus } from '../../modules/workspace/calendar/sync/sync.service.js';
import { SyncController } from '../../modules/workspace/calendar/sync/sync.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { socketAuthMiddleware } from '../../websocket/socketAuth.js';
import { KnowledgeChunkRepository } from '../../modules/ai/storage/repositories/knowledge-chunk-repository.js';
import { ExecutionRepository } from '../../modules/ai/execution/execution-repository.js';
import { AppError } from '../../middleware/error.middleware.js';
import { TaskStatus } from '../../modules/projects/projects.constants.js';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../../config/index.js';

describe('AETHER P3A — Critical Security & Production Reliability Remediation Suite', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const workspaceA = '33333333-3333-4333-a333-333333333333';
  const workspaceB = '44444444-4444-4444-a444-444444444444';
  const projectA = '55555555-5555-4555-a555-555555555555';
  const taskA1 = '77777777-7777-4777-a777-777777777771';
  const taskA2 = '77777777-7777-4777-a777-777777777772';
  const taskB1 = '88888888-8888-4888-a888-888888888881';

  let tasksRepo: TasksRepository;
  let tasksService: TasksService;
  let tasksController: TasksController;

  beforeEach(() => {
    vi.restoreAllMocks();
    tasksRepo = new TasksRepository();
    tasksService = new TasksService(tasksRepo);
    tasksController = new TasksController(tasksService);
  });

  // =========================================================================
  // 1. P0 — BULK-TASK AUTHORIZATION & TENANT ISOLATION
  // =========================================================================
  describe('P0: Bulk-Task Authorization & Multi-Tenant Isolation', () => {
    it('allows authorized user in workspace to execute bulk deletion on their own workspace tasks', async () => {
      // User A is a member of Workspace A
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA, role: 'MEMBER' } as any,
      ]);

      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        { id: taskA1, workspaceId: workspaceA, projectId: projectA, creatorId: userA, labels: [], status: 'TODO' } as any,
        { id: taskA2, workspaceId: workspaceA, projectId: projectA, creatorId: userA, labels: [], status: 'TODO' } as any,
      ]);

      vi.spyOn(db, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          plannerBlock: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          calendarEvent: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          task: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
        };
        return callback(tx);
      });

      const res = await tasksService.executeBulkOperation(
        {
          taskIds: [taskA1, taskA2],
          action: 'DELETE',
          payload: {},
        },
        userA,
        workspaceA,
      );

      expect(res.count).toBe(2);
      expect(res.success).toBe(true);
    });

    it('blocks User A from deleting User B tasks in another workspace (cross-tenant BOLA prevention)', async () => {
      // User A only has membership in Workspace A
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA, role: 'MEMBER' } as any,
      ]);

      // Target task belongs to Workspace B
      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        { id: taskB1, workspaceId: workspaceB, projectId: null, creatorId: userB, labels: [], status: 'TODO' } as any,
      ]);

      await expect(
        tasksService.executeBulkOperation(
          {
            taskIds: [taskB1],
            action: 'DELETE',
            payload: {},
          },
          userA,
          workspaceA,
        ),
      ).rejects.toThrowError(AppError);
    });

    it('rejects mixed-workspace task requests to prevent cross-workspace partial mutations', async () => {
      // User A is in Workspace A and Workspace B
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA, role: 'MEMBER' } as any,
        { workspaceId: workspaceB, role: 'MEMBER' } as any,
      ]);

      // Request mixes tasks from Workspace A and Workspace B
      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        { id: taskA1, workspaceId: workspaceA, projectId: projectA, creatorId: userA, labels: [], status: 'TODO' } as any,
        { id: taskB1, workspaceId: workspaceB, projectId: null, creatorId: userB, labels: [], status: 'TODO' } as any,
      ]);

      await expect(
        tasksService.executeBulkOperation(
          {
            taskIds: [taskA1, taskB1],
            action: 'DELETE',
            payload: {},
          },
          userA,
          workspaceA, // Scoped to workspace A
        ),
      ).rejects.toThrowError(/Mixed or unauthorized workspace tasks/);
    });

    it('rejects nonexistent task IDs with a 404 NOT_FOUND error', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA, role: 'MEMBER' } as any,
      ]);

      // Database returns only 1 task when 2 were requested
      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        { id: taskA1, workspaceId: workspaceA, projectId: projectA, creatorId: userA, labels: [], status: 'TODO' } as any,
      ]);

      await expect(
        tasksService.executeBulkOperation(
          {
            taskIds: [taskA1, '99999999-9999-4999-a999-999999999999'],
            action: 'DELETE',
            payload: {},
          },
          userA,
          workspaceA,
        ),
      ).rejects.toThrowError(/One or more requested tasks were not found/);
    });

    it('rejects unauthenticated requests at the controller level', async () => {
      await expect(
        tasksController.bulk({
          body: { taskIds: [taskA1], action: 'DELETE', payload: {} },
          user: undefined, // Unauthenticated
        }),
      ).rejects.toThrowError(/Unauthorized: valid user ID required/);
    });

    it('rejects malformed or empty task ID arrays safely', async () => {
      await expect(
        tasksService.executeBulkOperation(
          { taskIds: [], action: 'DELETE', payload: {} },
          userA,
          workspaceA,
        ),
      ).rejects.toThrowError(/non-empty array/);

      await expect(
        tasksService.executeBulkOperation(
          { taskIds: ['invalid-uuid-format'], action: 'DELETE', payload: {} },
          userA,
          workspaceA,
        ),
      ).rejects.toThrowError(/invalid UUID/);
    });
  });

  // =========================================================================
  // 2. P1 — CALENDAR SYNCHRONIZATION SAFETY & RESILIENCE
  // =========================================================================
  describe('P1: Calendar Synchronization Safety & Integration Reliability', () => {
    let syncService: SyncService;
    let syncController: SyncController;
    const calendarId1 = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

    beforeEach(() => {
      syncService = new SyncService(db);
      syncController = new SyncController(syncService);
    });

    it('reports clear 503 PROVIDER_UNAVAILABLE when external sync provider credentials are missing', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalGoogleId = process.env.GOOGLE_CLIENT_ID;
      process.env.NODE_ENV = 'production';
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      try {
        vi.spyOn(db.userCalendar, 'findFirst').mockResolvedValue({
          id: calendarId1,
          userId: userA,
          workspaceId: workspaceA,
        } as any);

        vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
          workspaceId: workspaceA,
          userId: userA,
        } as any);

        await expect(
          syncService.triggerSync(userA, calendarId1, SyncProvider.GOOGLE, workspaceA),
        ).rejects.toThrowError(/currently not configured or unavailable/);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalGoogleId) process.env.GOOGLE_CLIENT_ID = originalGoogleId;
      }
    });

    it('rejects sync request when calendar does not belong to the authenticated user', async () => {
      vi.spyOn(db.userCalendar, 'findFirst').mockResolvedValue(null);

      await expect(
        syncService.triggerSync(userA, calendarId1, SyncProvider.GOOGLE, workspaceA),
      ).rejects.toThrowError(/not found or unauthorized/);
    });

    it('rejects concurrent duplicate synchronization jobs on the same calendar with 409', async () => {
      vi.spyOn(db.userCalendar, 'findFirst').mockResolvedValue({
        id: calendarId1,
        userId: userA,
        workspaceId: workspaceA,
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      vi.spyOn(db.syncAccount, 'findUnique').mockResolvedValue({
        id: 'sync-acc-1',
        userId: userA,
        provider: 'GOOGLE',
        accessToken: 'mock-valid-token',
      } as any);

      // Existing active sync job in progress
      vi.spyOn(db.syncJob, 'findFirst').mockResolvedValue({
        id: 'job-in-progress',
        syncAccountId: 'sync-acc-1',
        calendarId: calendarId1,
        status: SyncStatus.SYNCING,
      } as any);

      await expect(
        syncService.triggerSync(userA, calendarId1, SyncProvider.GOOGLE, workspaceA),
      ).rejects.toThrowError(/already in progress/);
    });

    it('successfully persists and updates SyncJob record when provider sync completes', async () => {
      vi.spyOn(db.userCalendar, 'findFirst').mockResolvedValue({
        id: calendarId1,
        userId: userA,
        workspaceId: workspaceA,
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      vi.spyOn(db.syncAccount, 'findUnique').mockResolvedValue({
        id: 'sync-acc-1',
        userId: userA,
        provider: 'GOOGLE',
        accessToken: 'mock-valid-token',
      } as any);

      vi.spyOn(syncService['googleSync'], 'sync').mockResolvedValue({ syncedCount: 5 });
      vi.spyOn(db.syncJob, 'findFirst').mockResolvedValue(null); // No active duplicate

      vi.spyOn(db.syncJob, 'create').mockResolvedValue({
        id: 'job-123',
        syncAccountId: 'sync-acc-1',
        calendarId: calendarId1,
        status: SyncStatus.SYNCING,
      } as any);

      vi.spyOn(db.syncJob, 'update').mockResolvedValue({
        id: 'job-123',
        status: SyncStatus.SUCCESS,
        syncedCount: 5,
      } as any);

      const res = await syncService.triggerSync(userA, calendarId1, SyncProvider.GOOGLE, workspaceA);

      expect(res.status).toBe('SUCCESS');
      expect(res.jobId).toBe('job-123');
      expect(db.syncJob.create).toHaveBeenCalled();
      expect(db.syncJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-123' },
          data: expect.objectContaining({ status: SyncStatus.SUCCESS }),
        }),
      );
    });
  });

  // =========================================================================
  // 3. P2 — REMOVE UNSAFE JWT QUERY-PARAMETER AUTHENTICATION
  // =========================================================================
  describe('P2: Sensitive Credential Security & Query-Token Ingestion Removal', () => {
    let validToken: string;

    beforeEach(() => {
      validToken = jwt.sign(
        { id: userA, email: 'user@aether.local', role: 'USER', tokenVersion: 0 },
        securityConfig.jwt.secret,
      );
    });

    it('rejects HTTP requests passing JWT solely in query parameters by default', async () => {
      const req = {
        headers: {},
        query: { token: validToken },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'QUERY_TOKEN_DISALLOWED' }),
        }),
      );
      expect(next).not.toHaveBeenCalled();
      // Verifies token was redacted from req.query
      expect(req.query.token).toBeUndefined();
    });

    it('authenticates HTTP requests with Authorization: Bearer header properly', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: userA,
        tokenVersion: 0,
      } as any);

      const req = {
        headers: { authorization: `Bearer ${validToken}` },
        query: {},
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(userA);
    });

    it('rejects WebSocket connections attempting query parameter authentication without handshake auth', async () => {
      const socket = {
        id: 'sock-1',
        handshake: {
          auth: {},
          query: { token: validToken },
          headers: {},
        },
      } as any;
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Missing authorization token'),
        }),
      );
      // Verifies token was wiped from query
      expect(socket.handshake.query.token).toBeUndefined();
    });

    it('accepts WebSocket connections with handshake auth token', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: userA,
        tokenVersion: 0,
      } as any);

      const socket = {
        id: 'sock-2',
        handshake: {
          auth: { token: validToken },
          query: {},
          headers: {},
        },
      } as any;
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(); // called with no error
      expect(socket.user).toBeDefined();
      expect(socket.user.id).toBe(userA);
    });
  });

  // =========================================================================
  // 4. P2 — ELIMINATE SILENT PERSISTENCE FALLBACKS
  // =========================================================================
  describe('P2: Elimination of Silent In-Memory Persistence Fallbacks', () => {
    describe('KnowledgeChunkRepository', () => {
      let chunkRepo: KnowledgeChunkRepository;

      beforeEach(() => {
        chunkRepo = new KnowledgeChunkRepository();
      });

      it('throws 503 DATABASE_PERSISTENCE_ERROR when database upsert fails instead of falsely caching', async () => {
        vi.spyOn(db.documentChunk, 'upsert').mockRejectedValue(
          new Error('Connection terminated unexpectedly'),
        );

        const chunk = {
          id: 'chunk-1',
          documentId: 'doc-1',
          userId: userA,
          text: 'Critical knowledge data that must be durably persisted',
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 50,
          totalChunks: 1,
          metadata: {},
        } as any;

        await expect(chunkRepo.save([chunk])).rejects.toThrowError(
          /Database persistence failure: unable to durably store document chunk/,
        );

        // Invariant: Failed chunk must NOT exist in read cache
        const retrieved = await chunkRepo.getByIds(['chunk-1']);
        expect(retrieved).toHaveLength(0);
      });

      it('recovers after a transient glitch when bounded retry succeeds', async () => {
        let attempt = 0;
        vi.spyOn(db.documentChunk, 'upsert').mockImplementation((async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error('Transient socket reset');
          }
          return {} as any;
        }) as any);

        const chunk = {
          id: 'chunk-transient-1',
          documentId: 'doc-1',
          userId: userA,
          text: 'Recoverable content',
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 20,
          totalChunks: 1,
          metadata: {},
        } as any;

        await expect(chunkRepo.save([chunk])).resolves.not.toThrow();
        expect(attempt).toBe(2);
      });

      it('throws 503 DATABASE_READ_ERROR when database read fails in findByScope', async () => {
        vi.spyOn(db.documentChunk, 'findMany').mockRejectedValue(
          new Error('PostgreSQL read query timeout'),
        );

        await expect(
          chunkRepo.findByScope({ userId: userA, workspaceId: workspaceA }),
        ).rejects.toThrowError(/Database error: unable to query document chunks by scope/);
      });
    });

    describe('ExecutionRepository', () => {
      let execRepo: ExecutionRepository;

      beforeEach(() => {
        execRepo = new ExecutionRepository();
      });

      it('throws 503 DATABASE_PERSISTENCE_ERROR when agentExecution create fails instead of silent memory fallback', async () => {
        vi.spyOn(db.agentExecution, 'create').mockRejectedValue(
          new Error('Database disk full / connection refused'),
        );

        const executionData = {
          id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
          planId: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
          planVersion: 1,
          planHash: 'hash-123',
          correlationId: 'corr-1',
          userId: userA,
          workspaceId: workspaceA,
          status: 'QUEUED' as any,
          totalSteps: 2,
        };

        await expect(execRepo.createExecution(executionData)).rejects.toThrowError(
          /Execution persistence failure: unable to create execution record/,
        );

        // Invariant: Failed execution must NOT be retrievable from repository
        const found = await execRepo.findById('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', userA);
        expect(found).toBeNull();
      });

      it('throws 503 DATABASE_READ_ERROR when database read fails in findById', async () => {
        vi.spyOn(db.agentExecution, 'findUnique').mockRejectedValue(
          new Error('Connection reset by peer'),
        );

        await expect(
          execRepo.findById('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', userA),
        ).rejects.toThrowError(/Database error: unable to retrieve execution record/);
      });

      it('successfully persists execution to database when database is healthy', async () => {
        const execId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
        vi.spyOn(db.agentExecution, 'create').mockResolvedValue({
          id: execId,
          planId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
          planVersion: 1,
          planHash: 'hash',
          correlationId: 'corr-2',
          userId: userA,
          workspaceId: workspaceA,
          status: 'RUNNING',
          totalSteps: 1,
          startedAt: new Date(),
          updatedAt: new Date(),
          completedStepIds: [],
          failedStepIds: [],
          blockedStepIds: [],
          completedStepsCount: 0,
          failedStepsCount: 0,
          replanningRequired: false,
          metadata: {},
          steps: [],
        } as any);

        const created = await execRepo.createExecution({
          id: execId,
          planId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
          planVersion: 1,
          planHash: 'hash',
          correlationId: 'corr-2',
          userId: userA,
          workspaceId: workspaceA,
          status: 'RUNNING' as any,
          totalSteps: 1,
        });

        expect(created).toBeDefined();
        expect(created.id).toBe(execId);
        expect(created.status).toBe('RUNNING');
      });
    });
  });
});
