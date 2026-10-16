import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client';
import { CalendarRepository } from '../../modules/workspace/calendar/calendar.repository';
import { CalendarService } from '../../modules/workspace/calendar/calendar.service';
import { WorkspaceService } from '../../modules/workspace/workspace.service';
import { WorkspaceRepository } from '../../modules/workspace/workspace.repository';
import { SyncService, SyncProvider, SyncStatus } from '../../modules/workspace/calendar/sync/sync.service';
import { GoogleCalendarSync } from '../../modules/workspace/calendar/sync/google.sync';
import { OutlookCalendarSync } from '../../modules/workspace/calendar/sync/outlook.sync';
import { AppleCalendarSync } from '../../modules/workspace/calendar/sync/apple.sync';
import { AppError } from '../../middleware/error.middleware';

describe('AETHER P3 Regression — Calendar Scoping, Workspace Overview & External Sync', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const workspaceA = '33333333-3333-4333-a333-333333333333';
  const workspaceB = '44444444-4444-4444-a444-444444444444';
  const calendarId1 = '55555555-5555-4555-a555-555555555555';
  const eventId1 = '66666666-6666-4666-a666-666666666666';

  let calendarRepo: CalendarRepository;
  let calendarService: CalendarService;
  let workspaceRepo: WorkspaceRepository;
  let workspaceService: WorkspaceService;
  let syncService: SyncService;

  beforeEach(() => {
    vi.restoreAllMocks();
    calendarRepo = new CalendarRepository(db);
    calendarService = new CalendarService(calendarRepo);
    workspaceRepo = new WorkspaceRepository();
    workspaceService = new WorkspaceService(workspaceRepo, calendarService);
    syncService = new SyncService(db);
  });

  // =========================================================================
  // 1. CalendarService.getEvents() Authorization & Scoping
  // =========================================================================
  describe('CalendarService.getEvents() Authorization & Scoping', () => {
    it('rejects invalid non-UUID workspaceId with 400 INVALID_WORKSPACE_ID', async () => {
      await expect(
        calendarService.getEvents({ workspaceId: 'invalid-workspace-id', userId: userA }),
      ).rejects.toThrowError(AppError);

      try {
        await calendarService.getEvents({ workspaceId: 'invalid-workspace-id', userId: userA });
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.errorCode).toBe('INVALID_WORKSPACE_ID');
      }
    });

    it('rejects invalid non-UUID userId with 401 UNAUTHORIZED', async () => {
      await expect(
        calendarService.getEvents({ workspaceId: workspaceA, userId: 'bad-user' }),
      ).rejects.toThrowError(AppError);

      try {
        await calendarService.getEvents({ workspaceId: workspaceA, userId: 'bad-user' });
      } catch (err: any) {
        expect(err.statusCode).toBe(401);
        expect(err.errorCode).toBe('UNAUTHORIZED');
      }
    });

    it('rejects caller not belonging to the workspace with 403 FORBIDDEN', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      await expect(
        calendarService.getEvents({ workspaceId: workspaceA, userId: userB }),
      ).rejects.toThrowError(/Forbidden: Access to workspace calendar denied/);

      try {
        await calendarService.getEvents({ workspaceId: workspaceA, userId: userB });
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.errorCode).toBe('FORBIDDEN');
      }
    });

    it('retrieves real calendar events from PostgreSQL scoped to workspace and user', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      const mockEvents = [
        {
          id: eventId1,
          workspaceId: workspaceA,
          userId: userA,
          title: 'Sprint Planning',
          description: 'Q4 Product Roadmap',
          startDate: new Date('2026-10-15T10:00:00Z'),
          endDate: new Date('2026-10-15T11:00:00Z'),
          allDay: false,
          project: { id: 'p1', name: 'Core Project' },
          task: { id: 't1', title: 'Roadmap Task', status: 'TODO' },
        },
      ];

      vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValue(mockEvents as any);

      const res = await calendarService.getEvents({
        workspaceId: workspaceA,
        userId: userA,
        limit: 5,
      });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe(eventId1);
      expect(res.data[0].title).toBe('Sprint Planning');
      expect(db.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: workspaceA,
            userId: userA,
            deletedAt: null,
          }),
          take: 5,
        }),
      );
    });

    it('applies time boundary filtering when startDate and endDate are passed', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValue([]);

      const startWindow = new Date('2026-10-12T00:00:00Z');
      const endWindow = new Date('2026-10-19T23:59:59Z');

      await calendarService.getEvents({
        workspaceId: workspaceA,
        userId: userA,
        startDate: startWindow,
        endDate: endWindow,
      });

      expect(db.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endDate: { gte: startWindow },
            startDate: { lte: endWindow },
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 2. Workspace Overview Integration (upcomingEvents)
  // =========================================================================
  describe('WorkspaceService.getOverview() Calendar Integration', () => {
    it('populates upcomingEvents with real events for authorized workspace member', async () => {
      vi.spyOn(workspaceRepo, 'findById').mockResolvedValue({
        id: workspaceA,
        name: 'Engineering Workspace',
        deletedAt: null,
        members: [{ userId: userA, role: 'OWNER' }],
      } as any);

      const mockEvents = [
        {
          id: eventId1,
          workspaceId: workspaceA,
          userId: userA,
          title: 'Architecture Review',
          startDate: new Date('2026-10-16T14:00:00Z'),
          endDate: new Date('2026-10-16T15:00:00Z'),
        },
      ];

      vi.spyOn(calendarService, 'getEvents').mockResolvedValue({ data: mockEvents as any });

      const overview = await workspaceService.getOverview(workspaceA, userA);

      expect(overview.workspaceId).toBe(workspaceA);
      expect(overview.upcomingEvents).toHaveLength(1);
      expect(overview.upcomingEvents[0].title).toBe('Architecture Review');
      expect(calendarService.getEvents).toHaveBeenCalledWith({
        workspaceId: workspaceA,
        userId: userA,
        limit: 5,
      });
    });

    it('denies overview access to unauthorized non-member with 403 FORBIDDEN', async () => {
      vi.spyOn(workspaceRepo, 'findById').mockResolvedValue({
        id: workspaceA,
        name: 'Engineering Workspace',
        deletedAt: null,
        members: [{ userId: userA, role: 'OWNER' }],
      } as any);

      await expect(workspaceService.getOverview(workspaceA, userB)).rejects.toThrowError(
        /Access denied: You are not a member of this workspace/,
      );
    });

    it('returns 404 NOT_FOUND when workspace does not exist or is soft-deleted', async () => {
      vi.spyOn(workspaceRepo, 'findById').mockResolvedValue(null);

      await expect(workspaceService.getOverview(workspaceB, userA)).rejects.toThrowError(
        /Workspace not found/,
      );
    });
  });

  // =========================================================================
  // 3. External Calendar Synchronization Engines
  // =========================================================================
  describe('External Calendar Synchronization: Google, Outlook, Apple', () => {
    describe('Google Calendar Sync Engine', () => {
      it('syncs events from Google API and inserts new records into PostgreSQL', async () => {
        const googleSync = new GoogleCalendarSync();
        const fakeItems = [
          {
            id: 'g_event_1',
            summary: 'Google Standup',
            description: 'Daily sync',
            start: { dateTime: '2026-10-15T09:00:00Z' },
            end: { dateTime: '2026-10-15T09:30:00Z' },
            location: 'Google Meet',
          },
        ];

        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: fakeItems }),
        } as any);

        vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValueOnce([]); // No existing events
        vi.spyOn(db.calendarEvent, 'create').mockResolvedValueOnce({ id: 'new-g-event' } as any);

        const res = await googleSync.sync('valid-oauth-token', calendarId1, {
          userId: userA,
          workspaceId: workspaceA,
          prisma: db,
        });

        expect(res.syncedCount).toBe(1);
        expect(db.calendarEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: userA,
              workspaceId: workspaceA,
              title: 'Google Standup',
              reminders: expect.objectContaining({
                externalEventId: 'g_event_1',
                provider: 'GOOGLE',
              }),
            }),
          }),
        );
      });

      it('prevents duplicate events on repeat sync by updating existing record', async () => {
        const googleSync = new GoogleCalendarSync();
        const fakeItems = [
          {
            id: 'g_event_1',
            summary: 'Google Standup Updated',
            start: { dateTime: '2026-10-15T09:00:00Z' },
            end: { dateTime: '2026-10-15T09:30:00Z' },
          },
        ];

        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: fakeItems }),
        } as any);

        // Existing event already has this externalEventId
        vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValueOnce([
          {
            id: 'existing-event-uuid',
            title: 'Google Standup',
            startDate: new Date('2026-10-15T09:00:00Z'),
            workspaceId: workspaceA,
            reminders: { externalEventId: 'g_event_1', provider: 'GOOGLE' },
          },
        ] as any);

        vi.spyOn(db.calendarEvent, 'update').mockResolvedValueOnce({ id: 'existing-event-uuid' } as any);
        const createSpy = vi.spyOn(db.calendarEvent, 'create');

        const res = await googleSync.sync('valid-oauth-token', calendarId1, {
          userId: userA,
          workspaceId: workspaceA,
          prisma: db,
        });

        expect(res.syncedCount).toBe(1);
        expect(db.calendarEvent.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'existing-event-uuid' },
            data: expect.objectContaining({ title: 'Google Standup Updated' }),
          }),
        );
        expect(createSpy).not.toHaveBeenCalled();
      });

      it('handles 401 invalid access token error truthfully', async () => {
        const googleSync = new GoogleCalendarSync();

        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => 'Invalid Credentials',
        } as any);

        await expect(
          googleSync.sync('expired-token', calendarId1, { userId: userA, workspaceId: workspaceA, prisma: db }),
        ).rejects.toThrowError(/Google Calendar authentication failed/);
      });
    });

    describe('Outlook Calendar Sync Engine', () => {
      it('syncs events from Microsoft Graph and deduplicates against PostgreSQL', async () => {
        const outlookSync = new OutlookCalendarSync();
        const fakeItems = [
          {
            id: 'ms_event_1',
            subject: 'Sprint Retrospective',
            bodyPreview: 'Review sprint progress',
            start: { dateTime: '2026-10-16T15:00:00Z' },
            end: { dateTime: '2026-10-16T16:00:00Z' },
            isAllDay: false,
          },
        ];

        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ value: fakeItems }),
        } as any);

        vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValueOnce([]);
        vi.spyOn(db.calendarEvent, 'create').mockResolvedValueOnce({ id: 'new-ms-event' } as any);

        const res = await outlookSync.sync('valid-ms-token', calendarId1, {
          userId: userA,
          workspaceId: workspaceA,
          prisma: db,
        });

        expect(res.syncedCount).toBe(1);
        expect(db.calendarEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Sprint Retrospective',
              reminders: expect.objectContaining({
                externalEventId: 'ms_event_1',
                provider: 'OUTLOOK',
              }),
            }),
          }),
        );
      });

      it('handles 401 Microsoft Graph token expiration error', async () => {
        const outlookSync = new OutlookCalendarSync();

        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => 'Token expired',
        } as any);

        await expect(
          outlookSync.sync('bad-ms-token', calendarId1, { userId: userA, workspaceId: workspaceA, prisma: db }),
        ).rejects.toThrowError(/Outlook authentication failed/);
      });
    });

    describe('Apple Calendar Sync Engine', () => {
      it('parses valid iCal (.ics) feed and upserts events into PostgreSQL', async () => {
        const appleSync = new AppleCalendarSync();
        const fakeIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:apple_uid_123\r\nSUMMARY:Team Strategy Offsite\r\nDESCRIPTION:Quarterly strategy\r\nDTSTART:20261020T090000Z\r\nDTEND:20261020T170000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => fakeIcs,
        } as any);

        vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValueOnce([]);
        vi.spyOn(db.calendarEvent, 'create').mockResolvedValueOnce({ id: 'new-apple-event' } as any);

        const res = await appleSync.sync('https://p26-caldav.icloud.com/published/2/sample.ics', calendarId1, {
          userId: userA,
          workspaceId: workspaceA,
          prisma: db,
        });

        expect(res.syncedCount).toBe(1);
        expect(db.calendarEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Team Strategy Offsite',
              reminders: expect.objectContaining({
                externalEventId: 'apple_uid_123',
                provider: 'APPLE',
              }),
            }),
          }),
        );
      });

      it('rejects raw token without CalDAV/iCal URL honestly with 501 NOT_IMPLEMENTED', async () => {
        const appleSync = new AppleCalendarSync();

        await expect(
          appleSync.sync('raw-bearer-token-only', calendarId1, { userId: userA, workspaceId: workspaceA, prisma: db }),
        ).rejects.toThrowError(/Token-based sync without a CalDAV server is not supported by Apple/);
      });
    });
  });
});
