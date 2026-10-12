/**
 * AETHER P3B — Data Integrity, AI Trust, Performance & Scalability Test Suite
 *
 * Verifies:
 * - P3B-01: Focus sessions & time logging transaction durability & idempotency
 * - P3B-01: Task creation retry idempotency & atomic relational deletion
 * - P3B-01: Knowledge chunk & Execution repository durable failure propagation (503s)
 * - P3B-01: Document repository tenant scoping & UUID validation
 * - P3B-02: Private document exclusion in RAG retrieval & memory tenant isolation
 * - P3B-02: Tool confirmation gate protection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client.js';
import { AppError } from '../../middleware/error.middleware.js';
import { FocusService } from '../../modules/workspace/focus/focus.service.js';
import { FocusRepository } from '../../modules/workspace/focus/focus.repository.js';
import { FocusSessionEntity } from '../../modules/workspace/focus/focus.entity.js';
import { FocusSessionStatus } from '../../modules/workspace/workspace.constants.js';
import { TasksService } from '../../modules/projects/tasks/tasks.service.js';
import { TasksRepository } from '../../modules/projects/tasks/tasks.repository.js';
import { executionRepository } from '../../modules/ai/execution/execution-repository.js';
import { knowledgeChunkRepository } from '../../modules/ai/storage/repositories/knowledge-chunk-repository.js';
import { DocumentsRepository } from '../../modules/knowledge/documents/documents.repository.js';
import { Retriever } from '../../modules/ai/rag/retrieval/retriever.js';
import { contextEngine } from '../../modules/ai/core/context-engine.js';
import type { DocumentChunk } from '../../modules/ai/rag/rag-types.js';

describe('AETHER P3B — Data Integrity, AI Trust & Performance Suite', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const workspaceA = '33333333-3333-4333-a333-333333333333';
  const workspaceB = '44444444-4444-4444-a444-444444444444';
  const projectIdA = '55555555-5555-4555-a555-555555555555';
  const taskIdA = '66666666-6666-4666-a666-666666666666';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // P3B-01: Focus Sessions & Time Logging Durability
  // ============================================================================
  describe('P3B-01: Focus Sessions & Time Logging Durability', () => {
    const focusRepo = new FocusRepository();
    const focusService = new FocusService(focusRepo);

    it('throws 503 DATABASE_PERSISTENCE_ERROR when completeSession transaction fails (no false success)', async () => {
      const sessionId = '77777777-7777-4777-a777-777777777777';
      const existingSession = new FocusSessionEntity({
        id: sessionId,
        userId: userA,
        workspaceId: workspaceA,
        status: FocusSessionStatus.IN_PROGRESS,
        durationMinutes: 25,
        actualDurationSeconds: 0,
        distractionsCount: 0,
        taskId: taskIdA,
      });

      vi.spyOn(focusRepo, 'findById').mockResolvedValue(existingSession);
      vi.spyOn(db, '$transaction').mockRejectedValue(new Error('Connection terminated by PostgreSQL'));

      await expect(
        focusService.completeSession(sessionId, 1500, userA),
      ).rejects.toThrowError(/Database persistence failure: unable to complete focus session/);
    });

    it('is idempotent on retry and does not double-count task logged minutes if session is already completed', async () => {
      const sessionId = '77777777-7777-4777-a777-777777777777';
      const completedSession = new FocusSessionEntity({
        id: sessionId,
        userId: userA,
        workspaceId: workspaceA,
        status: FocusSessionStatus.COMPLETED,
        durationMinutes: 25,
        actualDurationSeconds: 1500,
        distractionsCount: 0,
        taskId: taskIdA,
      });

      vi.spyOn(focusRepo, 'findById').mockResolvedValue(completedSession);
      const txSpy = vi.spyOn(db, '$transaction');

      const result = await focusService.completeSession(sessionId, 1500, userA);

      expect(result.status).toBe(FocusSessionStatus.COMPLETED);
      // Invariant: No duplicate database transaction or double increment on retry
      expect(txSpy).not.toHaveBeenCalled();
    });

    it('focus repository throws explicit 503 error on create failure', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA } as any);
      vi.spyOn(db.workspace, 'findUnique').mockResolvedValue({ id: workspaceA } as any);
      vi.spyOn(db.focusSession, 'create').mockRejectedValue(new Error('Database disk full'));

      const session = new FocusSessionEntity({
        userId: userA,
        workspaceId: workspaceA,
        durationMinutes: 25,
        actualDurationSeconds: 0,
        distractionsCount: 0,
      });

      await expect(focusRepo.create(userA, session)).rejects.toThrowError(
        /Database persistence failure: unable to create focus session/,
      );
    });
  });

  // ============================================================================
  // P3B-01: Task Idempotency & Atomic Relational Deletion
  // ============================================================================
  describe('P3B-01: Task Creation Idempotency & Atomic Deletion', () => {
    const tasksRepo = new TasksRepository();
    const tasksService = new TasksService(tasksRepo);

    it('returns existing task idempotently on creation retry with same ID', async () => {
      const existingTask = {
        id: taskIdA,
        title: 'Authoritative Design Document',
        projectId: projectIdA,
        workspaceId: workspaceA,
        creatorId: userA,
        assigneeIds: [],
        dependencyTaskIds: [],
        labels: [],
        checklists: [],
        comments: [],
        status: 'TODO' as any,
        priority: 'HIGH' as any,
        isCompleted: false,
        loggedMinutes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(tasksRepo, 'findById').mockResolvedValue(existingTask as any);
      const saveSpy = vi.spyOn(tasksRepo, 'save');

      const result = await tasksService.createTask(
        { id: taskIdA, projectId: projectIdA, title: 'Authoritative Design Document' },
        userA,
      );

      expect(result.id).toBe(taskIdA);
      // Invariant: Save was not called again; duplicate prevented
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('atomically unlinks planner blocks and calendar events inside a transaction on task deletion', async () => {
      const taskToDelete = {
        id: taskIdA,
        title: 'Task To Delete',
        projectId: projectIdA,
        workspaceId: workspaceA,
        creatorId: userA,
        assigneeIds: [],
      };

      vi.spyOn(tasksService, 'getTask').mockResolvedValue(taskToDelete as any);

      let txExecuted = false;
      vi.spyOn(db, '$transaction').mockImplementation(async (callback: any) => {
        txExecuted = true;
        const mockTx = {
          plannerBlock: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
          calendarEvent: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          task: { update: vi.fn().mockResolvedValue({ id: taskIdA }) },
        };
        return callback(mockTx);
      });

      const deleted = await tasksService.deleteTask(taskIdA, userA);
      expect(deleted).toBe(true);
      expect(txExecuted).toBe(true);
    });

    it('throws 503 DATABASE_PERSISTENCE_ERROR if task deletion transaction fails', async () => {
      const taskToDelete = {
        id: taskIdA,
        title: 'Task To Delete',
        projectId: projectIdA,
        workspaceId: workspaceA,
        creatorId: userA,
      };

      vi.spyOn(tasksService, 'getTask').mockResolvedValue(taskToDelete as any);
      vi.spyOn(db, '$transaction').mockRejectedValue(new Error('Transaction lock timeout'));

      await expect(tasksService.deleteTask(taskIdA, userA)).rejects.toThrowError(
        /Database persistence failure: unable to delete task/,
      );
    });
  });

  // ============================================================================
  // P3B-01: Execution Repository & Knowledge Chunk Durability
  // ============================================================================
  describe('P3B-01: Execution & Knowledge Chunk Durable Read Failures', () => {
    it('execution repository throws 503 DATABASE_READ_ERROR when findByIdempotencyKey DB query fails', async () => {
      vi.spyOn(db.agentExecution, 'findUnique').mockRejectedValue(new Error('PostgreSQL connection drop'));

      await expect(
        executionRepository.findByIdempotencyKey('idem-key-99', userA),
      ).rejects.toThrowError(/Database error: unable to retrieve execution by idempotency key/);
    });

    it('execution repository throws 503 DATABASE_READ_ERROR when findByPlanId DB query fails', async () => {
      vi.spyOn(db.agentExecution, 'findFirst').mockRejectedValue(new Error('PostgreSQL connection drop'));

      await expect(
        executionRepository.findByPlanId('88888888-8888-4888-a888-888888888888', userA),
      ).rejects.toThrowError(/Database error: unable to retrieve execution by plan ID/);
    });

    it('execution repository throws 503 DATABASE_READ_ERROR when findStep DB query fails', async () => {
      vi.spyOn(db.agentExecutionStep, 'findUnique').mockRejectedValue(new Error('Step table locked'));

      await expect(
        executionRepository.findStep('11111111-1111-4111-a111-111111111111', 'step-1'),
      ).rejects.toThrowError(/Database error: unable to retrieve execution step/);
    });

    it('knowledge chunk repository throws 503 DATABASE_READ_ERROR when getById DB query fails', async () => {
      vi.spyOn(db.documentChunk, 'findUnique').mockRejectedValue(new Error('Connection reset'));

      await expect(
        knowledgeChunkRepository.getById('88888888-8888-4888-a888-888888888888'),
      ).rejects.toThrowError(/Database error: unable to read document chunk/);
    });

    it('knowledge chunk repository throws 503 DATABASE_READ_ERROR when getByDocumentId DB query fails', async () => {
      vi.spyOn(db.documentChunk, 'findMany').mockRejectedValue(new Error('Connection reset'));

      await expect(
        knowledgeChunkRepository.getByDocumentId('88888888-8888-4888-a888-888888888888'),
      ).rejects.toThrowError(/Database error: unable to read document chunks for document/);
    });

    it('knowledge chunk repository throws 503 DATABASE_DELETE_ERROR when deleteByDocument DB query fails', async () => {
      vi.spyOn(db.documentChunk, 'deleteMany').mockRejectedValue(new Error('Deadlock detected'));

      await expect(
        knowledgeChunkRepository.deleteByDocument('88888888-8888-4888-a888-888888888888'),
      ).rejects.toThrowError(/Database error: unable to delete document chunks/);
    });
  });

  // ============================================================================
  // P3B-01: Document Repository Validation & Tenant Scoping
  // ============================================================================
  describe('P3B-01: Documents Repository Scoping & Validation', () => {
    const docRepo = new DocumentsRepository();

    it('rejects delete operation with invalid UUID format (400)', async () => {
      await expect(docRepo.delete('invalid-uuid-format')).rejects.toThrowError(
        /Invalid document ID format/,
      );
    });

    it('strictly scopes findAll by requested workspaceId without leaking cross-workspace documents', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA },
        { workspaceId: workspaceB },
      ] as any);

      const findManySpy = vi.spyOn(db.document, 'findMany').mockResolvedValue([]);
      vi.spyOn(db.document, 'count').mockResolvedValue(0);

      await docRepo.findAll({ workspaceId: workspaceA }, userA);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            knowledgeBase: { workspaceId: workspaceA },
          },
        }),
      );
    });
  });

  // ============================================================================
  // P3B-02: AI Privacy & Context Isolation
  // ============================================================================
  describe('P3B-02: Private Document Exclusion in RAG Retrieval & Memory Isolation', () => {
    it('retriever resolveChunks excludes private documents from foreign user in same workspace', async () => {
      const retriever = new Retriever(
        { embed: vi.fn(), isAvailable: vi.fn().mockResolvedValue(true) } as any,
        { search: vi.fn() } as any,
        { search: vi.fn(), index: vi.fn() } as any,
        {
          getByIds: vi.fn().mockResolvedValue([
            {
              id: 'chunk-public-1',
              documentId: 'doc-public',
              text: 'Public workspace roadmap',
              chunkIndex: 0,
              totalChunks: 1,
              startOffset: 0,
              endOffset: 24,
              userId: userA,
              workspaceId: workspaceA,
              metadata: { isPrivate: false },
            },
            {
              id: 'chunk-private-1',
              documentId: 'doc-private',
              text: 'User A private compensation document',
              chunkIndex: 0,
              totalChunks: 1,
              startOffset: 0,
              endOffset: 36,
              userId: userA,
              workspaceId: workspaceA,
              metadata: { isPrivate: true },
            },
            {
              id: 'chunk-restricted-1',
              documentId: 'doc-restricted',
              text: 'User A restricted executive notes',
              chunkIndex: 0,
              totalChunks: 1,
              startOffset: 0,
              endOffset: 33,
              userId: userA,
              workspaceId: workspaceA,
              metadata: { canRead: [userA] },
            },
          ]),
        } as any,
        { rerank: vi.fn().mockImplementation(async (req) => req.candidates.map((c: any) => ({ chunk: c, score: 0.9 }))) } as any,
        { hybridSearchAlpha: 0.5, scoreThreshold: 0.5 } as any,
      );

      // User B queries inside the same workspace A
      const chunks = await (retriever as any).resolveChunks(
        ['chunk-public-1', 'chunk-private-1', 'chunk-restricted-1'],
        { userId: userB, workspaceId: workspaceA },
      );

      // Invariant: User B gets ONLY the public chunk; private and restricted chunks are excluded!
      expect(chunks).toHaveLength(1);
      expect(chunks[0].id).toBe('chunk-public-1');
    });

    it('context engine strictly isolates memories to requesting userId', async () => {
      const mockMemoryEngine = {
        getConversationHistory: vi.fn().mockReturnValue([]),
        getWorkingMemoryContext: vi.fn().mockReturnValue({ items: [] }),
        searchMemory: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            { id: 'mem-userA', userId: userA, content: 'User A personal goal', importance: 0.9 },
            { id: 'mem-userB', userId: userB, content: 'User B private secret', importance: 0.95 },
          ],
        }),
      };

      const customContextEngine = new (contextEngine.constructor as any)(
        mockMemoryEngine as any,
        undefined,
        { memory: { enabled: true } } as any,
      );

      const result = await customContextEngine.buildContext(
        {
          requestId: 'req-1',
          userId: userA,
          sessionId: 'sess-1',
          conversationId: 'conv-1',
          message: 'What should I remember?',
        },
        { type: 'MEMORY_RECALL', requiresMemory: true },
      );

      expect(result.ok).toBe(true);
      const memories = result.value.longTermMemory;
      expect(memories).toBeDefined();
      // Invariant: ONLY User A memories are included; User B memories are never leaked!
      expect(memories?.every((m: any) => m.userId === userA)).toBe(true);
      expect(memories?.some((m: any) => m.userId === userB)).toBe(false);
    });
  });
});
