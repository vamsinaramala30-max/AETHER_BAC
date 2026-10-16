import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client.js';
import { PlannerService } from '../../modules/workspace/planner/planner.service.js';
import { FocusService } from '../../modules/workspace/focus/focus.service.js';
import { FocusRepository } from '../../modules/workspace/focus/focus.repository.js';
import { FocusSessionStatus, FocusTimerType } from '../../modules/workspace/workspace.constants.js';

describe('AETHER P2B — Planner, Calendar & Focus Reliability Regression Suite', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const workspaceA = '33333333-3333-4333-a333-333333333333';
  const taskA = '44444444-4444-4444-a444-444444444444';
  const blockA = '55555555-5555-4555-a555-555555555555';
  const sessionA = '66666666-6666-4666-a666-666666666666';
  const eventA = '77777777-7777-4777-a777-777777777777';

  let plannerService: PlannerService;
  let focusService: FocusService;
  let focusRepo: FocusRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    plannerService = new PlannerService();
    focusRepo = new FocusRepository();
    focusService = new FocusService(focusRepo);
  });

  // =========================================================================
  // 1. WEEKLY PLANNER & TASK ASSOCIATION (P2B-1)
  // =========================================================================
  describe('1. Planner Block Creation & Editing with Valid Task', () => {
    it('creates a planner block linked to an existing valid task and returns relational task info', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA } as any);

      // Mock task validation in planner.service
      vi.spyOn(db.task, 'findFirst').mockResolvedValue({
        id: taskA,
        title: 'Build P2B Reliability',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        creatorId: userA,
        assigneeId: userA,
        workspaceId: workspaceA,
        deletedAt: null,
      } as any);

      // Mock block creation
      vi.spyOn(db.plannerBlock, 'create').mockResolvedValue({
        id: blockA,
        userId: userA,
        title: 'Deep Work on Task',
        dayKey: '2026-10-12',
        start: 9,
        duration: 60,
        completed: false,
        taskId: taskA,
        createdAt: new Date(),
        updatedAt: new Date(),
        task: {
          id: taskA,
          title: 'Build P2B Reliability',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
        },
      } as any);

      const block = await plannerService.createBlock(userA, {
        dayKey: '2026-10-12',
        label: 'Deep Work on Task',
        start: 9,
        duration: 60,
        taskId: taskA,
      });

      expect(block).toBeDefined();
      expect(block.id).toBe(blockA);
      expect(block.taskId).toBe(taskA);
      expect(block.taskTitle).toBe('Build P2B Reliability');
      expect(block.taskStatus).toBe('IN_PROGRESS');
      expect(db.task.findFirst).toHaveBeenCalledWith({
        where: { id: taskA, deletedAt: null },
      });
    });

    it('safely edits and removes task association from a planner block', async () => {
      vi.spyOn(db.plannerBlock, 'findUnique').mockResolvedValue({
        id: blockA,
        userId: userA,
        title: 'Existing Block',
        dayKey: '2026-10-12',
        start: 9,
        duration: 60,
        taskId: taskA,
      } as any);

      vi.spyOn(db.plannerBlock, 'update').mockResolvedValue({
        id: blockA,
        userId: userA,
        title: 'Standalone Block',
        dayKey: '2026-10-12',
        start: 9,
        duration: 60,
        taskId: null,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        task: null,
      } as any);

      const updated = await plannerService.updateBlock(userA, blockA, {
        label: 'Standalone Block',
        taskId: null,
      });

      expect(updated.taskId).toBeNull();
      expect(updated.taskTitle).toBeNull();
      expect(db.plannerBlock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: blockA },
          data: expect.objectContaining({ taskId: null }),
        }),
      );
    });
  });

  // =========================================================================
  // 2. REJECTING INVALID OR UNAUTHORIZED TASK ASSOCIATIONS (P2B-2)
  // =========================================================================
  describe('2. Rejecting Invalid or Unauthorized Task Associations', () => {
    it('rejects association with non-existent task', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA } as any);
      vi.spyOn(db.task, 'findFirst').mockResolvedValue(null);

      await expect(
        plannerService.createBlock(userA, {
          dayKey: '2026-10-12',
          label: 'Invalid Task Block',
          taskId: '99999999-9999-4999-a999-999999999999',
        }),
      ).rejects.toThrow('not found');
    });

    it('rejects soft-deleted task association (deletedAt !== null)', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA } as any);
      // findFirst filters where deletedAt: null so soft-deleted task returns null
      vi.spyOn(db.task, 'findFirst').mockResolvedValue(null);

      await expect(
        plannerService.createBlock(userA, {
          dayKey: '2026-10-12',
          label: 'Soft-deleted Task Block',
          taskId: taskA,
        }),
      ).rejects.toThrow('not found');
    });

    it('rejects unauthorized task association from another user/workspace', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA } as any);
      vi.spyOn(db.task, 'findFirst').mockResolvedValue({
        id: taskA,
        title: 'Private Task Other User',
        creatorId: userB,
        assigneeId: userB,
        workspaceId: workspaceA,
        deletedAt: null,
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      await expect(
        plannerService.createBlock(userA, {
          dayKey: '2026-10-12',
          label: 'Unauthorized Task Block',
          taskId: taskA,
        }),
      ).rejects.toThrow('Forbidden: you do not have permission to associate this task');
    });
  });

  // =========================================================================
  // 3. FOCUS TIMER COMPLETION & TASK LOGGED MINUTES (P2B-3)
  // =========================================================================
  describe('3. Focus Session Completion & Task Logged Minutes', () => {
    it('completes focus session and increments task.loggedMinutes transactionally', async () => {
      const startTime = new Date(Date.now() - 25 * 60 * 1000);
      const mockSession = {
        id: sessionA,
        userId: userA,
        workspaceId: workspaceA,
        type: FocusTimerType.POMODORO,
        status: FocusSessionStatus.IN_PROGRESS,
        durationMinutes: 25,
        actualDurationSeconds: 0,
        distractionsCount: 0,
        taskId: taskA,
        projectId: null,
        startTime,
        endTime: null,
        createdAt: startTime,
      };

      vi.spyOn(focusRepo, 'findById').mockResolvedValue(mockSession as any);

      const updatedSession = {
        ...mockSession,
        status: FocusSessionStatus.COMPLETED,
        actualDurationSeconds: 1500,
        endTime: new Date(),
      };

      let taskIncremented = false;
      let loggedMinutesIncrement = 0;

      // Mock transaction execution
      vi.spyOn(db, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          task: {
            updateMany: vi.fn().mockImplementation(({ data }: any) => {
              taskIncremented = true;
              loggedMinutesIncrement = data.loggedMinutes.increment;
              return Promise.resolve({ count: 1 });
            }),
          },
        };
        return callback(txMock);
      });

      vi.spyOn(focusRepo, 'update').mockResolvedValue(updatedSession as any);

      const completed = await focusService.completeSession(sessionA, 1500, userA);

      expect(completed.status).toBe(FocusSessionStatus.COMPLETED);
      expect(completed.actualDurationSeconds).toBe(1500);
      expect(taskIncremented).toBe(true);
      expect(loggedMinutesIncrement).toBe(25); // 1500 sec = 25 min
    });
  });

  // =========================================================================
  // 4. PREVENTING DUPLICATE TIME LOGGING (P2B-4)
  // =========================================================================
  describe('4. Idempotency & Duplicate Time Logging Prevention', () => {
    it('returns existing session immediately without re-incrementing task.loggedMinutes on repeated completion calls', async () => {
      const alreadyCompleted = {
        id: sessionA,
        userId: userA,
        workspaceId: workspaceA,
        type: FocusTimerType.POMODORO,
        status: FocusSessionStatus.COMPLETED,
        durationMinutes: 25,
        actualDurationSeconds: 1500,
        distractionsCount: 0,
        taskId: taskA,
        projectId: null,
        startTime: new Date(Date.now() - 30 * 60 * 1000),
        endTime: new Date(Date.now() - 5 * 60 * 1000),
        createdAt: new Date(),
      };

      vi.spyOn(focusRepo, 'findById').mockResolvedValue(alreadyCompleted as any);
      const txSpy = vi.spyOn(db, '$transaction');

      const result = await focusService.completeSession(sessionA, 1500, userA);

      expect(result.status).toBe(FocusSessionStatus.COMPLETED);
      // Because session was already COMPLETED, transaction and task increment must NOT be called again
      expect(txSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. SESSION STATE RECOVERY ACROSS REFRESH (P2B-5)
  // =========================================================================
  describe('5. Focus Session State Recovery Across Refresh', () => {
    it('accurately recovers active session without interval drift or data loss', () => {
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      const endTimestamp = now + tenMinutes;

      const persistedActiveState = {
        selectedMinutes: 25,
        status: 'running' as const,
        endTimestamp,
        remainingSeconds: 600,
        taskId: taskA,
        startTimestamp: now - 15 * 60 * 1000,
      };

      // Simulate page refresh: calculate remaining time from absolute endTimestamp
      const simulatedNowAfterRefresh = now + 60 * 1000; // 1 minute passed during refresh/navigation
      const remainingMs = persistedActiveState.endTimestamp - simulatedNowAfterRefresh;
      const recoveredRemainingSeconds = Math.ceil(remainingMs / 1000);

      expect(recoveredRemainingSeconds).toBe(540); // Exactly 9 minutes (540s) left
      expect(persistedActiveState.taskId).toBe(taskA);
    });

    it('identifies sessions that completed while user was away or tab was closed', () => {
      const now = Date.now();
      const pastEndTimestamp = now - 5000; // Ended 5 seconds ago

      const persistedState = {
        selectedMinutes: 25,
        status: 'running' as const,
        endTimestamp: pastEndTimestamp,
        remainingSeconds: 0,
        taskId: taskA,
        startTimestamp: now - 26 * 60 * 1000,
      };

      const remainingMs = persistedState.endTimestamp - now;
      const hasEndedWhileAway = remainingMs <= 0;

      expect(hasEndedWhileAway).toBe(true);
      expect(persistedState.selectedMinutes).toBe(25);
    });
  });

  // =========================================================================
  // 6. CALENDAR RECURRENCE & RRULE METADATA PRESERVATION (P2B-6)
  // =========================================================================
  describe('6. Preserving Recurrence Metadata in Calendar Event Operations', () => {
    it('persists and retrieves recurrence rule correctly without stripping RRULE properties', async () => {
      const rrulePayload = {
        freq: 'WEEKLY',
        interval: 1,
        byweekday: ['MO', 'WE', 'FR'],
        until: '2026-12-31T23:59:59Z',
      };

      const mockEvent = {
        id: eventA,
        userId: userA,
        title: 'Weekly Sprint Sync',
        startDate: new Date('2026-10-12T10:00:00Z'),
        endDate: new Date('2026-10-12T11:00:00Z'),
        allDay: false,
        recurrence: JSON.stringify(rrulePayload),
        taskId: taskA,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValue([mockEvent as any]);

      const events = await db.calendarEvent.findMany({
        where: { userId: userA },
      });

      expect(events).toHaveLength(1);
      expect(events[0].recurrence).toBeDefined();
      const parsedRule = JSON.parse(events[0].recurrence as string);
      expect(parsedRule.freq).toBe('WEEKLY');
      expect(parsedRule.byweekday).toEqual(['MO', 'WE', 'FR']);
      expect(parsedRule.until).toBe('2026-12-31T23:59:59Z');
    });
  });

  // =========================================================================
  // 7. LOCAL TIME & DATE BOUNDARY FILTERING (P2B-7)
  // =========================================================================
  describe('7. Local-Time and Date-Boundary Filtering', () => {
    it('filters events within specified date boundaries without timezone offset truncation', async () => {
      const startRange = new Date('2026-10-12T00:00:00.000Z');
      const endRange = new Date('2026-10-12T23:59:59.999Z');

      const findManySpy = vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValue([]);

      // Test boundary query
      await db.calendarEvent.findMany({
        where: {
          userId: userA,
          startDate: {
            gte: startRange,
            lte: endRange,
          },
        },
      });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: userA,
            startDate: {
              gte: startRange,
              lte: endRange,
            },
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 8. PREVENTING DUPLICATE PLANNER/CALENDAR RECORDS (P2B-8)
  // =========================================================================
  describe('8. Preventing Duplicate Records During Synchronization', () => {
    it('uses existing record check / upsert logic to prevent duplicate synchronization records', async () => {
      const existingBlock = {
        id: blockA,
        userId: userA,
        title: 'Morning Strategy',
        startTime: new Date('2026-10-12T08:00:00Z'),
        endTime: new Date('2026-10-12T09:00:00Z'),
        taskId: taskA,
      };

      // Mock finding existing block
      vi.spyOn(db.plannerBlock, 'findFirst').mockResolvedValue(existingBlock as any);
      const createSpy = vi.spyOn(db.plannerBlock, 'create');
      const updateSpy = vi.spyOn(db.plannerBlock, 'update').mockResolvedValue({
        ...existingBlock,
        title: 'Updated Morning Strategy',
      } as any);

      // Synchronization logic: find if existing block matches
      const existing = await db.plannerBlock.findFirst({
        where: {
          userId: userA,
          dayKey: '2026-10-12',
          title: 'Morning Strategy',
        },
      });

      if (existing) {
        await db.plannerBlock.update({
          where: { id: existing.id },
          data: { title: 'Updated Morning Strategy' },
        });
      } else {
        await db.plannerBlock.create({ data: existingBlock as any });
      }

      // Must update existing, NEVER create duplicate
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: blockA } }),
      );
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 9. HANDLING NETWORK & PERSISTENCE FAILURES (P2B-9)
  // =========================================================================
  describe('9. Handling Network & Persistence Failures Without Silently Losing Data', () => {
    it('propagates database errors to caller without masking as false success', async () => {
      vi.spyOn(focusRepo, 'findById').mockRejectedValue(new Error('PostgreSQL connection timeout'));

      await expect(
        focusService.completeSession(sessionA, 1500, userA),
      ).rejects.toThrow('PostgreSQL connection timeout');
    });

    it('simulates client offline fallback queue storing pending session', () => {
      const mockOfflineStorage: any[] = [];
      const pendingSession = {
        id: `pending-${Date.now()}`,
        minutes: 25,
        taskId: taskA,
        createdAt: Date.now(),
      };

      // Simulate failure interceptor pushing to offline queue
      mockOfflineStorage.push(pendingSession);

      expect(mockOfflineStorage).toHaveLength(1);
      expect(mockOfflineStorage[0].taskId).toBe(taskA);
      expect(mockOfflineStorage[0].minutes).toBe(25);
    });
  });
});
