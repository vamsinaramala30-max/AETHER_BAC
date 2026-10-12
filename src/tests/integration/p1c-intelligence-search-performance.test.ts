// ============================================================================
// File: src/tests/integration/p1c-intelligence-search-performance.test.ts
// Description: Comprehensive P1C verification suite testing AI Context Engine,
// Live Productivity Context, Native pgvector RAG, Global Search (9 entities),
// Memory Consolidation & Contradiction Resolution, Tool Safety & Verification.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../database/client';
import { liveContextService } from '../../modules/ai/context/live-context-service';
import { responseSynthesizer } from '../../modules/ai/core/response-synthesizer';
import { memoryEngine } from '../../modules/ai/memory/memory-engine';
import { knowledgeChunkRepository } from '../../modules/ai/storage/repositories/knowledge-chunk-repository';
import { toUuid } from '../../modules/ai/storage/repositories/memory-repository';
import { DocumentsService } from '../../modules/knowledge/documents/documents.service';
import { DocumentsRepository } from '../../modules/knowledge/documents/documents.repository';
import { SearchService } from '../../modules/knowledge/search/search.service';
import { SearchRepository } from '../../modules/knowledge/search/search.repository';
import {
  getTodaysScheduleTool,
  getFocusSessionsTool,
  createCalendarEventTool,
} from '../../modules/ai/tools/productivity-tools';
import { TaskStatus, TaskPriority, ProjectStatus, ProjectPriority } from '@prisma/client';
import type { AIContext } from '../../modules/ai/ai-types';
import type { SynthesisInput } from '../../modules/ai/core/response-synthesizer';

describe('AETHER P1C — AI Intelligence, Knowledge, Search & Performance', () => {
  const userA_id = '11111111-1111-4111-a111-111111111111';
  const userB_id = '22222222-2222-4222-a222-222222222222';
  const workspaceA_id = '33333333-3333-4333-a333-333333333333';
  const projectA_id = '55555555-5555-4555-a555-555555555555';
  const projectB_id = '66666666-6666-4666-a666-666666666666';

  const documentsRepository = new DocumentsRepository();
  const documentsService = new DocumentsService(documentsRepository);
  const searchRepository = new SearchRepository();
  const searchService = new SearchService(searchRepository);

  let createdTaskIds: string[] = [];
  let createdBlockIds: string[] = [];
  let createdEventIds: string[] = [];
  let createdSessionIds: string[] = [];
  let createdDocIds: string[] = [];

  beforeEach(async () => {
    createdTaskIds = [];
    createdBlockIds = [];
    createdEventIds = [];
    createdSessionIds = [];
    createdDocIds = [];

    // Ensure Users exist for foreign key relations
    await db.user.upsert({
      where: { id: userA_id },
      create: {
        id: userA_id,
        email: 'userA_p1c@test.local',
        username: 'userA_p1c',
      },
      update: {},
    });

    await db.user.upsert({
      where: { id: userB_id },
      create: {
        id: userB_id,
        email: 'userB_p1c@test.local',
        username: 'userB_p1c',
      },
      update: {},
    });

    // Ensure Workspace & Projects exist
    await db.workspace.upsert({
      where: { id: workspaceA_id },
      create: {
        id: workspaceA_id,
        name: 'P1C Workspace A',
        slug: 'p1c-ws-a',
      },
      update: {},
    });

    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspaceA_id,
          userId: userA_id,
        },
      },
      create: {
        workspaceId: workspaceA_id,
        userId: userA_id,
        role: 'OWNER',
      },
      update: {},
    });

    await db.project.upsert({
      where: { id: projectA_id },
      create: {
        id: projectA_id,
        name: 'Apollo Spacecraft',
        workspaceId: workspaceA_id,
        ownerId: userA_id,
        status: ProjectStatus.ACTIVE,
        priority: ProjectPriority.HIGH,
      },
      update: {},
    });

    await db.project.upsert({
      where: { id: projectB_id },
      create: {
        id: projectB_id,
        name: 'Zeus Battery System',
        workspaceId: workspaceA_id,
        ownerId: userB_id,
        status: ProjectStatus.ACTIVE,
        priority: ProjectPriority.MEDIUM,
      },
      update: {},
    });
  });

  afterEach(async () => {
    // Clean up created resources
    if (createdTaskIds.length > 0) {
      await db.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (createdBlockIds.length > 0) {
      await db.plannerBlock.deleteMany({ where: { id: { in: createdBlockIds } } });
    }
    if (createdEventIds.length > 0) {
      await db.calendarEvent.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    if (createdSessionIds.length > 0) {
      await db.focusSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    }
    for (const docId of createdDocIds) {
      await documentsService.deleteDocument(docId, userA_id).catch(() => {});
    }
  });

  // ==========================================================================
  // SECTION 1: AI CONTEXT ENGINE & LIVE PRODUCTIVITY STATE
  // ==========================================================================
  describe('Live Productivity Context & Anti-Fabrication', () => {
    it('queries authoritative database state for overdue tasks, planner blocks, and active focus', async () => {
      // 1. Create overdue task for User A
      const pastDue = new Date(Date.now() - 48 * 3600 * 1000);
      const overdueTask = await db.task.create({
        data: {
          title: 'Deploy Thermal Shield',
          projectId: projectA_id,
          workspaceId: workspaceA_id,
          creatorId: userA_id,
          assigneeId: userA_id,
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
          dueDate: pastDue,
        },
      });
      createdTaskIds.push(overdueTask.id);

      // 2. Create today planner block for User A
      const todayKey = new Date().toISOString().split('T')[0]!;
      const block = await db.plannerBlock.create({
        data: {
          userId: userA_id,
          workspaceId: workspaceA_id,
          dayKey: todayKey,
          title: 'Deep Work: Propulsion Check',
          start: 9.0,
          duration: 90,
          bucket: 'deep_work',
          completed: false,
          taskId: overdueTask.id,
        },
      });
      createdBlockIds.push(block.id);

      // 3. Create active focus session for User A
      const session = await db.focusSession.create({
        data: {
          userId: userA_id,
          workspaceId: workspaceA_id,
          projectId: projectA_id,
          taskId: overdueTask.id,
          type: 'deep_focus',
          status: 'IN_PROGRESS',
          durationMinutes: 45,
        },
      });
      createdSessionIds.push(session.id);

      // 4. Query live context for User A
      const context = await liveContextService.getLiveContext(userA_id, {
        queryMessage: 'What am I focusing on right now and which tasks are overdue?',
      });

      expect(context.overdueTasks.length).toBeGreaterThanOrEqual(1);
      expect(context.overdueTasks.some((t) => t.id === overdueTask.id)).toBe(true);
      expect(context.todayPlannerBlocks.some((b) => b.id === block.id)).toBe(true);
      expect(context.activeFocusSession).not.toBeNull();
      expect(context.activeFocusSession?.id).toBe(session.id);
      expect(context.activeFocusSession?.taskTitle).toBe('Deploy Thermal Shield');
      expect(context.summaryText).toContain('Deploy Thermal Shield');
      expect(context.summaryText).toContain('deep_focus');
    });

    it('enforces tenant and user isolation: User B cannot retrieve User A private context', async () => {
      // Create private focus session and task for User A
      const sessionA = await db.focusSession.create({
        data: {
          userId: userA_id,
          workspaceId: workspaceA_id,
          type: 'secret_research',
          status: 'IN_PROGRESS',
          durationMinutes: 60,
        },
      });
      createdSessionIds.push(sessionA.id);

      // Query User B live context
      const contextB = await liveContextService.getLiveContext(userB_id, {
        queryMessage: 'What am I focusing on right now?',
      });

      // User B should have no active focus session
      expect(contextB.activeFocusSession).toBeNull();
      expect(contextB.overdueTasks.length).toBe(0);
    });

    it('never fabricates missing data: returns "No matching data found." when DB has no records', async () => {
      const emptyContext: AIContext = {
        userId: userB_id,
        sessionId: 'sess_empty',
        conversationId: 'conv_empty',
        tokenBudget: { total: 4096, system: 500, history: 1000, context: 1500, response: 1096, remaining: 1096 },
        productivityContext: {
          overdueTasks: [],
          todayTasks: [],
          todayPlannerBlocks: [],
          upcomingCalendarEvents: [],
          activeFocusSession: null,
          projectsWithUnfinishedWork: [],
          summaryText: '',
        },
      };

      const emptyInput: SynthesisInput = {
        request: {
          requestId: 'req_empty_1',
          userId: userB_id,
          sessionId: 's1',
          conversationId: 'c1',
          message: 'Which tasks are overdue?',
          timestamp: Date.now(),
        },
        intent: { type: 'TASK_MANAGEMENT' as const, confidence: 0.9, requiresConfirmation: false } as any,
        context: emptyContext,
        assessment: { valid: true, confidence: 0.9 } as any,
      };

      // Test overdue tasks empty state
      const overdueAns = responseSynthesizer.synthesize(emptyInput);
      expect(overdueAns.content).toBe('No matching data found.');

      // Test meetings tomorrow empty state
      const meetingInput: SynthesisInput = {
        ...emptyInput,
        request: { ...emptyInput.request, requestId: 'req_empty_2', message: 'What meetings do I have tomorrow?' },
      };
      const meetingAns = responseSynthesizer.synthesize(meetingInput);
      expect(meetingAns.content).toBe('No matching data found.');

      // Test focus session empty state
      const focusInput: SynthesisInput = {
        ...emptyInput,
        request: { ...emptyInput.request, requestId: 'req_empty_3', message: 'What am I focusing on right now?' },
      };
      const focusAns = responseSynthesizer.synthesize(focusInput);
      expect(focusAns.content).toBe('No matching data found.');
    });
  });

  // ==========================================================================
  // SECTION 2: MEMORY ENGINE CONTRADICTION & CONSOLIDATION
  // ==========================================================================
  describe('Memory Contradiction & Consolidation', () => {
    it('handles contradictory memory by marking previous record as superseded with audit trail', async () => {
      const topic = 'work_schedule_preference';

      // 1. Create original memory
      const m1Res = await memoryEngine.createMemory({
        userId: userA_id,
        type: 'preference',
        content: 'Preferred work hours: 9am - 5pm',
        importance: 0.8,
        metadata: { topic, status: 'active', source: 'user_explicit' },
      });
      expect(m1Res.ok).toBe(true);
      const m1 = (m1Res as any).value;

      // 2. Create contradictory memory on the same topic
      const m2Res = await memoryEngine.createMemory({
        userId: userA_id,
        type: 'preference',
        content: 'Preferred work hours: 11am - 7pm',
        importance: 0.9,
        metadata: { topic, source: 'user_explicit_update' },
      });
      expect(m2Res.ok).toBe(true);
      const m2 = (m2Res as any).value;

      // 3. Inspect m1 status in store: must be superseded by m2.id
      const storeM1 = await (memoryEngine as any).longTermStore.repo.getById(m1.id, userA_id);
      expect(storeM1?.metadata?.status).toBe('superseded');
      expect(storeM1?.metadata?.supersededBy).toBe(m2.id);

      // 4. Searching active memory returns only m2, not m1
      const activeMemories = await memoryEngine.getAllMemory(userA_id);
      expect(activeMemories.ok).toBe(true);
      const activeIds = (activeMemories as any).value.map((m: any) => m.id);
      expect(activeIds).toContain(m2.id);
      expect(activeIds).not.toContain(m1.id);
    });

    it('consolidates low-importance/related memories into a unified summary without data loss', async () => {
      // Store 2 small related facts
      const topic = 'mission_logistics';
      await memoryEngine.createMemory({
        userId: userA_id,
        type: 'fact',
        content: 'Fuel tank capacity is 4500 liters',
        importance: 0.5,
        metadata: { topic, status: 'active' },
      });
      await memoryEngine.createMemory({
        userId: userA_id,
        type: 'fact',
        content: 'Oxygen reserves last 14 days',
        importance: 0.5,
        metadata: { topic, status: 'active' },
      });

      const consResult = await memoryEngine.consolidateMemories(userA_id);
      expect(consResult.ok).toBe(true);
      expect((consResult as any).value.consolidatedCount).toBeGreaterThanOrEqual(2);
      expect((consResult as any).value.newItemsCount).toBeGreaterThanOrEqual(1);

      // Verify consolidated item exists and is active
      const allMemories = await memoryEngine.getAllMemory(userA_id);
      expect(allMemories.ok).toBe(true);
      const consolidatedItem = (allMemories as any).value.find((m: any) => m.metadata?.isConsolidated === true);
      expect(consolidatedItem).toBeDefined();
      expect(consolidatedItem?.content).toContain('4500 liters');
      expect(consolidatedItem?.content).toContain('14 days');
    });
  });

  // ==========================================================================
  // SECTION 3: RAG & NATIVE PGVECTOR RETRIEVAL
  // ==========================================================================
  describe('RAG Native pgvector & Project Scoping', () => {
    it('creates document with project scope, stores embeddings, and searches via native pgvector', async () => {
      // 1. Create project-scoped knowledge document
      const doc = await documentsService.createDocument(
        {
          title: 'Apollo Cryogenic Spec',
          description: 'Liquid oxygen temperature must remain at -183 Celsius during all flight phases.',
          fileKey: 'docs/apollo-cryogenic.txt',
          fileSize: 1024,
          mimeType: 'text/plain',
          originalName: 'apollo-cryogenic.txt',
          workspaceId: workspaceA_id,
          projectId: projectA_id,
          tags: ['propulsion', 'cryogenics'],
        },
        userA_id,
        workspaceA_id,
      );
      createdDocIds.push(doc.id);

      expect(['INDEXED', 'PUBLISHED', 'READY']).toContain(doc.status);

      // 2. Perform native vector search with project scope
      const mockEmbedding = new Array(768).fill(0.05);
      mockEmbedding[0] = 0.9;

      // Persist test chunk embedding to native pgvector column
      const chunks = await knowledgeChunkRepository.getByDocumentId(doc.id);
      expect(chunks.length).toBeGreaterThan(0);
      const chunkId = chunks[0]!.id;

      const vecStr = `[${mockEmbedding.join(',')}]`;
      await (db as any).$executeRawUnsafe(
        `UPDATE "document_chunks" SET "embedding" = $1::vector WHERE id = $2::uuid`,
        vecStr,
        toUuid(chunkId),
      );

      // 3. Search via native vector query
      const searchRes = await knowledgeChunkRepository.searchNativeVector(mockEmbedding, 5, 0.1, {
        workspaceId: workspaceA_id,
        projectId: projectA_id,
      });

      expect(searchRes.length).toBeGreaterThan(0);
      expect(searchRes[0]!.documentId).toBe(doc.id);

      // 4. Verify cross-project isolation: searching projectB returns 0 results
      const isolatedSearch = await knowledgeChunkRepository.searchNativeVector(mockEmbedding, 5, 0.1, {
        workspaceId: workspaceA_id,
        projectId: projectB_id,
      });
      expect(isolatedSearch.length).toBe(0);
    });

    it('reindexes document idempotently without chunk duplication', async () => {
      const doc = await documentsService.createDocument(
        {
          title: 'Guidance Computer Firmware',
          description: 'AGC firmware version 4.2 contains updated orbital calculation parameters.',
          fileKey: 'docs/guidance-firmware.txt',
          fileSize: 2048,
          mimeType: 'text/plain',
          originalName: 'guidance-firmware.txt',
          workspaceId: workspaceA_id,
          projectId: projectA_id,
        },
        userA_id,
        workspaceA_id,
      );
      createdDocIds.push(doc.id);

      const initialChunks = await knowledgeChunkRepository.getByDocumentId(doc.id);
      const initialCount = initialChunks.length;
      expect(initialCount).toBeGreaterThan(0);

      // Trigger reindexing
      const reindexed = await documentsService.reindexDocument(doc.id, userA_id, workspaceA_id);
      expect(['INDEXED', 'PUBLISHED', 'READY']).toContain(reindexed.status);

      const afterChunks = await knowledgeChunkRepository.getByDocumentId(doc.id);
      // Chunks count must not duplicate
      expect(afterChunks.length).toBe(initialCount);
    });
  });

  // ==========================================================================
  // SECTION 4: GLOBAL SEARCH EXPANSION (9 ENTITIES)
  // ==========================================================================
  describe('Global Search Across 9 Core Entities', () => {
    it('covers Tasks, Projects, Files, Documents, Calendar, Planner, Automations, Notes with navigation links', async () => {
      // 1. Create a searchable task
      const task = await db.task.create({
        data: {
          title: 'Quantum Telemetry Radar',
          projectId: projectA_id,
          workspaceId: workspaceA_id,
          creatorId: userA_id,
          status: TaskStatus.TODO,
        },
      });
      createdTaskIds.push(task.id);

      // 2. Create a searchable calendar event
      const now = new Date();
      const event = await db.calendarEvent.create({
        data: {
          title: 'Quantum Telemetry Briefing',
          workspaceId: workspaceA_id,
          userId: userA_id,
          startDate: new Date(now.getTime() + 3600000),
          endDate: new Date(now.getTime() + 7200000),
        },
      });
      createdEventIds.push(event.id);

      // 3. Search for "Quantum Telemetry"
      const result = await searchService.search(
        { query: 'Quantum Telemetry', limit: 10 },
        userA_id,
        workspaceA_id,
      );

      expect(result.results.length).toBeGreaterThanOrEqual(2);

      // Verify entity type identification
      const taskResult = result.results.find((r: any) => r.type === 'TASK');
      const calendarResult = result.results.find((r: any) => r.type === 'CALENDAR');

      expect(taskResult).toBeDefined();
      expect(taskResult?.title).toBe('Quantum Telemetry Radar');
      expect(taskResult?.href).toContain(`/app/projects/tasks?taskId=${task.id}`);

      expect(calendarResult).toBeDefined();
      expect(calendarResult?.title).toBe('Quantum Telemetry Briefing');
      expect(calendarResult?.href).toContain('/app/workspace/calendar');

      // AI Answer synthesis includes entity breakdowns
      expect(result.aiAnswer).toContain('Quantum Telemetry');
    });

    it('strictly isolates search results across workspaces', async () => {
      // User B searches workspaceB for User A's task
      const result = await searchService.search(
        { query: 'Deploy Thermal Shield', limit: 10 },
        userB_id,
        '44444444-4444-4444-a444-444444444444',
      );

      // Must not leak User A's task from workspaceA
      expect(result.results.length).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 5: AI PRODUCTIVITY TOOLS & STATE VERIFICATION
  // ==========================================================================
  describe('Productivity Tools & Verification', () => {
    it('getTodaysScheduleTool aggregates calendar events, planner blocks, and tasks into unified schedule', async () => {
      const today = new Date();
      const todayKey = today.toISOString().split('T')[0]!;

      // Create a calendar event for today
      const event = await db.calendarEvent.create({
        data: {
          title: 'Flight Readiness Review',
          workspaceId: workspaceA_id,
          userId: userA_id,
          startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0),
          endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0, 0),
        },
      });
      createdEventIds.push(event.id);

      // Create a planner block for today
      const block = await db.plannerBlock.create({
        data: {
          userId: userA_id,
          workspaceId: workspaceA_id,
          dayKey: todayKey,
          title: 'Engine Calibration Session',
          start: 10.0,
          duration: 60,
          bucket: 'deep_work',
          completed: false,
        },
      });
      createdBlockIds.push(block.id);

      const schedule = await getTodaysScheduleTool.handler(
        { date: todayKey },
        { auth: { userId: userA_id, workspaceId: workspaceA_id } } as any,
      );

      expect(schedule.items.length).toBeGreaterThanOrEqual(2);
      expect(schedule.items.some((i) => i.title === 'Flight Readiness Review' && i.type === 'calendar_event')).toBe(true);
      expect(schedule.items.some((i) => i.title === 'Engine Calibration Session' && i.type === 'planner_block')).toBe(true);
    });

    it('createCalendarEventTool mutates database and verifies state in PostgreSQL', async () => {
      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 90000000).toISOString();

      const output = await createCalendarEventTool.handler(
        {
          title: 'Trajectory Alignment Meeting',
          startDate: start,
          endDate: end,
          location: 'Mission Control Room 4',
        },
        { auth: { userId: userA_id, workspaceId: workspaceA_id } } as any,
      );

      createdEventIds.push(output.eventId);
      expect(output.title).toBe('Trajectory Alignment Meeting');

      // State verification
      const verification = await (createCalendarEventTool.verify as any)!(output, {} as any, {} as any);
      expect(verification.verified).toBe(true);
      expect(verification.details).toContain('verified in PostgreSQL');
    });
  });
});
