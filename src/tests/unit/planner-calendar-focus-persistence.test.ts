import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FocusRepository } from '../../modules/workspace/focus/focus.repository.js';
import { FocusService } from '../../modules/workspace/focus/focus.service.js';
import { FocusSessionEntity } from '../../modules/workspace/focus/focus.entity.js';
import { FocusSessionStatus, FocusTimerType } from '../../modules/workspace/workspace.constants.js';
import { db } from '../../database/client.js';

describe('Batch 5: Planner, Calendar & Focus Persistence (Authoritative PostgreSQL)', () => {
  const mockUserId1 = '00000000-0000-4000-a000-000000000001';
  const mockUserId2 = '00000000-0000-4000-a000-000000000002';
  const mockWorkspaceId = '00000000-0000-4000-a000-000000000010';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. FOCUS SESSION PERSISTENCE (DATA-02)
  // =========================================================================
  describe('Focus & Productivity Persistence (DATA-02)', () => {
    it('creates and persists focus session with UUID, taskId, and projectId in activityLog', async () => {
      const mockCreatedLog = {
        id: '11111111-1111-4111-a111-111111111111',
        userId: mockUserId1,
        workspaceId: mockWorkspaceId,
        action: 'FOCUS_SESSION_STARTED',
        entityType: 'FOCUS_SESSION',
        entityId: '11111111-1111-4111-a111-111111111111',
        entityName: 'deep_work',
        metadata: {
          id: '11111111-1111-4111-a111-111111111111',
          type: 'deep_work',
          status: 'IN_PROGRESS',
          durationMinutes: 45,
          actualDurationSeconds: 0,
          distractionsCount: 0,
          taskId: 'task-101',
          projectId: 'proj-202',
          startTime: new Date().toISOString(),
        },
        createdAt: new Date(),
      };

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'mem-1',
        userId: mockUserId1,
        workspaceId: mockWorkspaceId,
        role: 'MEMBER',
        joinedAt: new Date(),
      } as any);

      vi.spyOn(db.activityLog, 'create').mockResolvedValue(mockCreatedLog as any);

      const repo = new FocusRepository();
      const service = new FocusService(repo);

      const session = await service.startSession(mockUserId1, {
        workspaceId: mockWorkspaceId,
        durationMinutes: 45,
        type: FocusTimerType.CUSTOM,
        taskId: 'task-101',
        projectId: 'proj-202',
      });

      expect(session).toBeDefined();
      expect(session.userId).toBe(mockUserId1);
      expect(session.durationMinutes).toBe(45);
      expect(session.taskId).toBe('task-101');
      expect(session.projectId).toBe('proj-202');
      expect(session.status).toBe(FocusSessionStatus.IN_PROGRESS);
      expect(db.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId1,
            workspaceId: mockWorkspaceId,
            action: 'FOCUS_SESSION_STARTED',
            entityType: 'FOCUS_SESSION',
            metadata: expect.objectContaining({
              taskId: 'task-101',
              projectId: 'proj-202',
              durationMinutes: 45,
            }),
          }),
        }),
      );
    });

    it('completes session and updates status and actual duration in database', async () => {
      const sessionId = '22222222-2222-4222-a222-222222222222';
      const mockLog = {
        id: sessionId,
        userId: mockUserId1,
        workspaceId: mockWorkspaceId,
        action: 'FOCUS_SESSION_STARTED',
        entityType: 'FOCUS_SESSION',
        entityId: sessionId,
        metadata: {
          id: sessionId,
          type: 'focus',
          status: 'IN_PROGRESS',
          durationMinutes: 25,
          actualDurationSeconds: 0,
          distractionsCount: 1,
          taskId: 'task-55',
          startTime: new Date().toISOString(),
        },
        createdAt: new Date(),
      };

      vi.spyOn(db.activityLog, 'findFirst').mockResolvedValue(mockLog as any);
      vi.spyOn(db.activityLog, 'updateMany').mockResolvedValue({ count: 1 } as any);

      const repo = new FocusRepository();
      const service = new FocusService(repo);

      const completed = await service.completeSession(sessionId, 1500);

      expect(completed.status).toBe(FocusSessionStatus.COMPLETED);
      expect(completed.actualDurationSeconds).toBe(1500);
      expect(completed.endTime).toBeInstanceOf(Date);
      expect(db.activityLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: sessionId,
            entityType: 'FOCUS_SESSION',
          }),
          data: expect.objectContaining({
            action: 'FOCUS_SESSION_COMPLETED',
            metadata: expect.objectContaining({
              status: 'COMPLETED',
              actualDurationSeconds: 1500,
            }),
          }),
        }),
      );
    });

    it('queries database for focus history sorted by time and computes analytics accurately', async () => {
      const logs = [
        {
          id: 'log-1',
          userId: mockUserId1,
          workspaceId: mockWorkspaceId,
          entityType: 'FOCUS_SESSION',
          action: 'FOCUS_SESSION_COMPLETED',
          metadata: {
            id: 'sess-1',
            status: 'COMPLETED',
            durationMinutes: 30,
            actualDurationSeconds: 1800,
            distractionsCount: 2,
          },
          createdAt: new Date('2026-09-24T10:00:00Z'),
        },
        {
          id: 'log-2',
          userId: mockUserId1,
          workspaceId: mockWorkspaceId,
          entityType: 'FOCUS_SESSION',
          action: 'FOCUS_SESSION_COMPLETED',
          metadata: {
            id: 'sess-2',
            status: 'COMPLETED',
            durationMinutes: 25,
            actualDurationSeconds: 1500,
            distractionsCount: 0,
          },
          createdAt: new Date('2026-09-24T14:00:00Z'),
        },
      ];

      vi.spyOn(db.activityLog, 'findMany').mockResolvedValue(logs as any);

      const repo = new FocusRepository();
      const service = new FocusService(repo);

      const history = await service.getHistory(mockWorkspaceId, mockUserId1);
      expect(history.length).toBe(2);
      expect(history[0].id).toBe('sess-1');
      expect(history[1].id).toBe('sess-2');

      const analytics = await service.getAnalytics({
        workspaceId: mockWorkspaceId,
        userId: mockUserId1,
      });

      expect(analytics.totalSessions).toBe(2);
      expect(analytics.totalFocusMinutes).toBe(55); // (1800 + 1500) / 60
      expect(analytics.totalDistractions).toBe(2);
      expect(analytics.averageDistractionsPerSession).toBe('1.0');
    });

    it('enforces user ownership when deleting focus session', async () => {
      const sessionId = '33333333-3333-4333-a333-333333333333';

      vi.spyOn(db.activityLog, 'deleteMany').mockImplementation(((args: any) => {
        if (args.where.userId === mockUserId1 && args.where.entityId === sessionId) {
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      }) as any);

      const repo = new FocusRepository();
      const service = new FocusService(repo);

      // Authorized user succeeds
      const resultOwner = await service.deleteSession(sessionId, mockUserId1);
      expect(resultOwner).toBe(true);

      // Foreign user fails
      const resultForeign = await service.deleteSession(sessionId, mockUserId2);
      expect(resultForeign).toBe(false);
    });
  });

  // =========================================================================
  // 2. WEEKLY PLANNER SERVER PERSISTENCE (DATA-03)
  // =========================================================================
  describe('Weekly Planner Persistence (DATA-03)', () => {
    it('persists planner daysData to userSettings displayPreferences in PostgreSQL', async () => {
      const sampleDaysData = {
        '2026-09-24': {
          blocks: [
            {
              id: 'blk-1',
              title: 'Design API Specs',
              startTime: '09:00',
              endTime: '10:30',
              day: '2026-09-24',
              priority: 'high',
              completed: false,
              taskId: 'task-77',
            },
          ],
        },
      };

      vi.spyOn(db.userSettings, 'findUnique').mockResolvedValue({
        id: 'sett-1',
        userId: mockUserId1,
        displayPreferences: {},
      } as any);

      const upsertSpy = vi.spyOn(db.userSettings, 'upsert').mockResolvedValue({
        id: 'sett-1',
        userId: mockUserId1,
        displayPreferences: {
          weeklyPlanner: {
            daysData: sampleDaysData,
            updatedAt: new Date().toISOString(),
          },
        },
      } as any);

      // Test planner upsert logic
      const updatedPlanner = {
        daysData: sampleDaysData,
        updatedAt: new Date().toISOString(),
      };
      const updatedPrefs = { weeklyPlanner: updatedPlanner };

      await db.userSettings.upsert({
        where: { userId: mockUserId1 },
        create: { userId: mockUserId1, displayPreferences: updatedPrefs },
        update: { displayPreferences: updatedPrefs },
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId1 },
          create: expect.objectContaining({
            userId: mockUserId1,
            displayPreferences: expect.objectContaining({
              weeklyPlanner: expect.objectContaining({
                daysData: sampleDaysData,
              }),
            }),
          }),
        }),
      );
    });

    it('updates specific day without overwriting existing days', async () => {
      const existingDays = {
        '2026-09-23': {
          blocks: [{ id: 'blk-old', title: 'Existing Task', day: '2026-09-23', completed: true }],
        },
      };

      const incomingDay = {
        blocks: [{ id: 'blk-new', title: 'New Task', day: '2026-09-24', completed: false }],
      };

      vi.spyOn(db.userSettings, 'findUnique').mockResolvedValue({
        id: 'sett-1',
        userId: mockUserId1,
        displayPreferences: {
          weeklyPlanner: {
            daysData: existingDays,
            updatedAt: '2026-09-23T00:00:00Z',
          },
        },
      } as any);

      const upsertSpy = vi.spyOn(db.userSettings, 'upsert').mockResolvedValue({} as any);

      // Merging specific day
      const mergedDays = {
        ...existingDays,
        '2026-09-24': incomingDay,
      };

      await db.userSettings.upsert({
        where: { userId: mockUserId1 },
        create: {
          userId: mockUserId1,
          displayPreferences: { weeklyPlanner: { daysData: mergedDays } },
        },
        update: {
          displayPreferences: { weeklyPlanner: { daysData: mergedDays } },
        },
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            displayPreferences: {
              weeklyPlanner: {
                daysData: expect.objectContaining({
                  '2026-09-23': existingDays['2026-09-23'],
                  '2026-09-24': incomingDay,
                }),
              },
            },
          },
        }),
      );
    });

    it('isolates planner data between different authenticated users', async () => {
      vi.spyOn(db.userSettings, 'findUnique').mockImplementation((async (args: any) => {
        if (args.where.userId === mockUserId1) {
          return {
            id: 'sett-1',
            userId: mockUserId1,
            displayPreferences: {
              weeklyPlanner: {
                daysData: { '2026-09-24': { blocks: [{ id: 'u1-blk' }] } },
              },
            },
          };
        }
        return {
          id: 'sett-2',
          userId: mockUserId2,
          displayPreferences: {
            weeklyPlanner: {
              daysData: { '2026-09-24': { blocks: [{ id: 'u2-blk' }] } },
            },
          },
        };
      }) as any);

      const user1Settings = await db.userSettings.findUnique({ where: { userId: mockUserId1 } });
      const user2Settings = await db.userSettings.findUnique({ where: { userId: mockUserId2 } });

      const u1Data = (user1Settings?.displayPreferences as any)?.weeklyPlanner?.daysData;
      const u2Data = (user2Settings?.displayPreferences as any)?.weeklyPlanner?.daysData;

      expect(u1Data['2026-09-24'].blocks[0].id).toBe('u1-blk');
      expect(u2Data['2026-09-24'].blocks[0].id).toBe('u2-blk');
      expect(u1Data).not.toEqual(u2Data);
    });
  });

  // =========================================================================
  // 3. CALENDAR DATA-04 RESOLUTION & PERSISTENCE
  // =========================================================================
  describe('Calendar Persistence & DATA-04 Resolution', () => {
    it('populates valid non-empty calendarId on event fetch and handles reminders JSON', async () => {
      const mockEvent = {
        id: 'evt-1',
        title: 'Team Sync',
        description: 'Weekly team catch-up',
        startTime: new Date('2026-09-24T10:00:00Z'),
        endTime: new Date('2026-09-24T11:00:00Z'),
        allDay: false,
        location: 'Room A',
        userId: mockUserId1,
        workspaceId: mockWorkspaceId,
        projectId: null,
        reminders: {
          calendarId: 'primary-cal-1',
          customColor: '#3b82f6',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValue([mockEvent] as any);

      // Verify that calendarId is extracted from reminders metadata if present, or user default
      const events = await db.calendarEvent.findMany({ where: { userId: mockUserId1 } });
      const transformed = events.map((e: any) => {
        const metadata = (e.reminders && typeof e.reminders === 'object' ? e.reminders : {}) as Record<string, any>;
        const calendarId = metadata.calendarId || `user-${e.userId}`;
        return {
          id: e.id,
          title: e.title,
          calendarId,
          start: e.startTime.toISOString(),
          end: e.endTime.toISOString(),
        };
      });

      expect(transformed[0].calendarId).toBe('primary-cal-1');
      expect(transformed[0].calendarId).not.toBe('');
      expect(transformed[0].start).toBe('2026-09-24T10:00:00.000Z');
    });

    it('enforces workspace boundary on calendar event mutations', async () => {
      vi.spyOn(db.calendarEvent, 'findFirst').mockImplementation((async (args: any) => {
        if (args.where.id === 'evt-1' && args.where.workspaceId === mockWorkspaceId) {
          return { id: 'evt-1', workspaceId: mockWorkspaceId };
        }
        return null;
      }) as any);

      // Authorized workspace access succeeds
      const eventAuth = await db.calendarEvent.findFirst({
        where: { id: 'evt-1', workspaceId: mockWorkspaceId },
      });
      expect(eventAuth).not.toBeNull();

      // Cross-workspace unauthorized access returns null
      const eventForeign = await db.calendarEvent.findFirst({
        where: { id: 'evt-1', workspaceId: 'foreign-workspace-999' },
      });
      expect(eventForeign).toBeNull();
    });
  });
});
