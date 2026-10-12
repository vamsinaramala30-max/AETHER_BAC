// ============================================================================
// File: backend/src/tests/integration/p1b-core-integration.test.ts
// Description: Comprehensive P1B integration suite testing Workspace,
// Realtime, Tasks, Planner, Calendar, Focus, Notifications, and End-to-End sync.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import http from 'node:http';
import { db } from '../../database/client';
import { workspaceService } from '../../modules/workspace/workspace.service';
import { TasksService } from '../../modules/projects/tasks/tasks.service';
import { TasksRepository } from '../../modules/projects/tasks/tasks.repository';
import { plannerService } from '../../modules/workspace/planner/planner.service';
import { FocusService } from '../../modules/workspace/focus/focus.service';
import { FocusRepository } from '../../modules/workspace/focus/focus.repository';
import { notificationService } from '../../modules/notification/notification.service';
import { socketAuthMiddleware } from '../../websocket/socketAuth';
import { WorkspaceGateway } from '../../websocket/workspace.gateway';
import { initWebSocketServer, getIo, emitToWorkspace, emitToUser, setIoInstance } from '../../websocket/socket';
import { SocketEvent } from '../../websocket/socketTypes';
import { TaskStatus } from '../../modules/projects/projects.constants';
import { WorkspaceRole } from '@prisma/client';
import { securityConfig } from '../../config';

describe('AETHER P1B — Workspace, Realtime & Core System Integration', () => {
  const userA_id = '11111111-1111-4111-a111-111111111111';
  const userB_id = '22222222-2222-4222-a222-222222222222';
  const workspaceA_id = '33333333-3333-4333-a333-333333333333';
  const workspaceB_id = '44444444-4444-4444-a444-444444444444';
  const projectA_id = '55555555-5555-4555-a555-555555555555';

  const tasksRepo = new TasksRepository();
  const tasksService = new TasksService(tasksRepo);
  const focusRepo = new FocusRepository();
  const focusService = new FocusService(focusRepo);

  let mockIo: any;
  let emittedEvents: Array<{ target: string; event: string; payload: any }>;

  beforeEach(() => {
    vi.restoreAllMocks();
    emittedEvents = [];

    // Construct a high-fidelity mock Socket.IO server to inspect scoped delivery
    mockIo = {
      to: vi.fn().mockImplementation((room: string) => ({
        emit: vi.fn().mockImplementation((event: string, payload: any) => {
          emittedEvents.push({ target: room, event, payload });
        }),
      })),
      emit: vi.fn().mockImplementation((event: string, payload: any) => {
        emittedEvents.push({ target: 'global', event, payload });
      }),
      use: vi.fn(),
      on: vi.fn(),
    };
    setIoInstance(mockIo as any);
  });

  afterEach(() => {
    setIoInstance(null as any);
  });

  // =========================================================================
  // 1. WORKSPACE FOUNDATION, MEMBERSHIP & RBAC
  // =========================================================================
  describe('Workspace Foundation & RBAC', () => {
    it('creates workspace with automatic owner membership and unique slug', async () => {
      const mockWorkspace = {
        id: workspaceA_id,
        name: 'Alpha Lab',
        slug: 'alpha-lab',
        description: 'Test Workspace',
        plan: 'free',
        storageLimitMb: 5120,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.spyOn(db.workspace, 'create').mockResolvedValue(mockWorkspace as any);

      const created = await workspaceService.createWorkspace(userA_id, {
        name: 'Alpha Lab',
        description: 'Test Workspace',
      });

      expect(created.id).toBe(workspaceA_id);
      expect(created.slug).toBe('alpha-lab');
      expect(db.workspace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Alpha Lab',
            members: expect.objectContaining({
              create: expect.objectContaining({
                userId: userA_id,
                role: 'OWNER',
              }),
            }),
          }),
        }),
      );
    });

    it('lists only workspaces where the user is an active member', async () => {
      vi.spyOn(db.workspace, 'findMany').mockResolvedValue([
        {
          id: workspaceA_id,
          name: 'Alpha Lab',
          slug: 'alpha-lab',
          plan: 'free',
          storageUsedMb: 0,
          storageLimitMb: 5120,
          deletedAt: null,
          members: [{ id: 'mem_1', userId: userA_id, role: WorkspaceRole.OWNER }],
        },
      ] as any);

      const workspaces = await workspaceService.getUserWorkspaces(userA_id);
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0]!.id).toBe(workspaceA_id);
      expect(workspaces[0]!.members[0]!.role).toBe(WorkspaceRole.OWNER);
    });

    it('enforces workspace isolation: User A cannot access Workspace B if not a member', async () => {
      vi.spyOn(db.workspace, 'findUnique').mockResolvedValue({
        id: workspaceB_id,
        name: 'Beta Lab',
        deletedAt: null,
        members: [{ id: 'mem_b', userId: userB_id, role: WorkspaceRole.OWNER }],
      } as any);

      await expect(
        workspaceService.getWorkspaceById(workspaceB_id, userA_id),
      ).rejects.toThrow('Access denied: You are not a member of this workspace');
    });

    it('allows owner to add member and emits workspace:member_added realtime event', async () => {
      (vi.spyOn(db.workspaceMember, 'findUnique') as any).mockImplementation(async (args: any) => {
        if (args.where?.workspaceId_userId?.userId === userA_id) {
          return { id: 'mem_owner', workspaceId: workspaceA_id, userId: userA_id, role: WorkspaceRole.OWNER } as any;
        }
        return null;
      });

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: userB_id,
        email: 'userb@aether.local',
        firstName: 'Bob',
        lastName: 'User',
      } as any);

      const addedRecord = {
        id: 'mem_b',
        workspaceId: workspaceA_id,
        userId: userB_id,
        role: WorkspaceRole.MEMBER,
        joinedAt: new Date(),
        user: { id: userB_id, email: 'userb@aether.local', firstName: 'Bob', lastName: 'User' },
      };
      vi.spyOn(db.workspaceMember, 'create').mockResolvedValue(addedRecord as any);

      const member = await workspaceService.addMember(workspaceA_id, userA_id, {
        userId: userB_id,
        role: WorkspaceRole.MEMBER,
      });

      expect(member.userId).toBe(userB_id);
      expect(member.role).toBe(WorkspaceRole.MEMBER);

      // Verify realtime event was emitted to workspace room
      const memberAddedEvent = emittedEvents.find(
        (e) => e.target === `workspace:${workspaceA_id}` && e.event === SocketEvent.WORKSPACE_MEMBER_ADDED,
      );
      expect(memberAddedEvent).toBeDefined();
      expect(memberAddedEvent?.payload.member.userId).toBe(userB_id);
    });

    it('prevents member removal if caller has insufficient role', async () => {
      (vi.spyOn(db.workspaceMember, 'findUnique') as any).mockImplementation(async (args: any) => {
        if (args.where?.workspaceId_userId?.userId === userB_id) {
          return { id: 'mem_b', workspaceId: workspaceA_id, userId: userB_id, role: WorkspaceRole.MEMBER } as any;
        }
        if (args.where?.workspaceId_userId?.userId === userA_id) {
          return { id: 'mem_a', workspaceId: workspaceA_id, userId: userA_id, role: WorkspaceRole.MEMBER } as any;
        }
        return null;
      });

      await expect(
        workspaceService.removeMember(workspaceA_id, userB_id, userA_id),
      ).rejects.toThrow('Insufficient permissions to remove members');
    });

    it('protects the sole OWNER from being removed or demoted', async () => {
      (vi.spyOn(db.workspaceMember, 'findUnique') as any).mockImplementation(async (args: any) => {
        return {
          id: 'mem_owner',
          workspaceId: workspaceA_id,
          userId: userA_id,
          role: WorkspaceRole.OWNER,
        } as any;
      });

      vi.spyOn(db.workspaceMember, 'count').mockResolvedValue(1); // Sole owner

      await expect(
        workspaceService.updateMemberRole(workspaceA_id, userA_id, userA_id, WorkspaceRole.MEMBER),
      ).rejects.toThrow('Cannot demote the sole workspace owner');

      await expect(
        workspaceService.removeMember(workspaceA_id, userA_id, userA_id),
      ).rejects.toThrow(/Cannot remove.*sole workspace owner/);
    });
  });

  // =========================================================================
  // 2. REALTIME WEBSOCKET INFRASTRUCTURE & AUTHENTICATION
  // =========================================================================
  describe('Realtime Infrastructure & Scoping', () => {
    it('authenticates socket handshake with valid JWT and verifies against DB', async () => {
      const validToken = jwt.sign(
        { id: userA_id, email: 'usera@aether.local', role: 'USER', tokenVersion: 0 },
        securityConfig.jwt.secret,
      );

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: userA_id,
        email: 'usera@aether.local',
        tokenVersion: 0,
        isActive: true,
      } as any);

      const mockSocket: any = {
        handshake: { auth: { token: validToken }, headers: {}, query: {} },
        data: {},
      };
      const nextFn = vi.fn();

      await socketAuthMiddleware(mockSocket, nextFn);
      expect(nextFn).toHaveBeenCalledWith();
      expect(mockSocket.user.id).toBe(userA_id);
    });

    it('rejects socket connection when tokenVersion is revoked in DB', async () => {
      const staleToken = jwt.sign(
        { id: userA_id, email: 'usera@aether.local', role: 'USER', tokenVersion: 0 },
        securityConfig.jwt.secret,
      );

      // DB tokenVersion incremented to 1
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: userA_id,
        email: 'usera@aether.local',
        tokenVersion: 1,
        isActive: true,
      } as any);

      const mockSocket: any = {
        handshake: { auth: { token: staleToken }, headers: {}, query: {} },
        data: {},
      };
      const nextFn = vi.fn();

      await socketAuthMiddleware(mockSocket, nextFn);
      expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
      expect(nextFn.mock.calls[0][0].message).toContain('Session has been revoked');
    });

    it('enforces database membership check when client attempts to join workspace room', async () => {
      const socketListeners: Record<string, Function> = {};
      const joinedRooms: string[] = [];

      const mockSocket: any = {
        user: { id: userA_id, email: 'usera@aether.local' },
        join: vi.fn().mockImplementation((room: string) => {
          joinedRooms.push(room);
        }),
        on: vi.fn().mockImplementation((event: string, handler: Function) => {
          socketListeners[event] = handler;
        }),
        emit: vi.fn(),
      };

      const gateway = new WorkspaceGateway();
      gateway.registerHandlers(mockIo as any, mockSocket);

      // Scenario 1: User A is a valid member of Workspace A -> join allowed
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'mem_1',
        workspaceId: workspaceA_id,
        userId: userA_id,
        role: 'OWNER',
      } as any);

      const ackValid = vi.fn();
      await socketListeners[SocketEvent.JOIN_WORKSPACE](workspaceA_id, ackValid);
      expect(mockSocket.join).toHaveBeenCalledWith(`workspace:${workspaceA_id}`);
      expect(ackValid).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      // Scenario 2: User A is NOT a member of Workspace B -> join rejected, room denied
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      const ackDenied = vi.fn();
      await socketListeners[SocketEvent.JOIN_WORKSPACE](workspaceB_id, ackDenied);
      expect(mockSocket.join).not.toHaveBeenCalledWith(`workspace:${workspaceB_id}`);
      expect(ackDenied).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden' }));
    });
  });

  // =========================================================================
  // 3. TASKS ↔ PLANNER INTEGRATION
  // =========================================================================
  describe('Tasks ↔ Planner Integration', () => {
    it('creating a task emits task:created to the workspace', async () => {
      const taskMock = {
        id: 'tsk_101',
        title: 'Build Integration Layer',
        status: TaskStatus.TODO,
        priority: 'MEDIUM',
        workspaceId: workspaceA_id,
        creatorId: userA_id,
        assigneeIds: [],
        dependencyTaskIds: [],
        labels: [],
        checklists: [],
        comments: [],
        isCompleted: false,
        completedAt: null,
        loggedMinutes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(tasksRepo, 'save').mockResolvedValue(taskMock as any);

      const created = await tasksService.createTask(
        { title: 'Build Integration Layer', projectId: projectA_id },
        userA_id,
      );

      expect(created.id).toBe('tsk_101');
      const wsEvent = emittedEvents.find(
        (e) => e.target === `workspace:${workspaceA_id}` && e.event === SocketEvent.TASK_CREATED,
      );
      expect(wsEvent).toBeDefined();
      expect(wsEvent?.payload.title).toBe('Build Integration Layer');
    });

    it('completing a task synchronizes linked PlannerBlocks to completed: true and emits planner:updated', async () => {
      const existingTask = {
        id: 'tsk_101',
        title: 'Build Integration Layer',
        status: TaskStatus.IN_PROGRESS,
        workspaceId: workspaceA_id,
        creatorId: userA_id,
        assigneeIds: [],
        isCompleted: false,
        loggedMinutes: 0,
      };

      vi.spyOn(tasksService, 'getTask').mockResolvedValue(existingTask as any);
      vi.spyOn(tasksRepo, 'save').mockResolvedValue({
        ...existingTask,
        status: TaskStatus.DONE,
        isCompleted: true,
        completedAt: new Date(),
      } as any);

      vi.spyOn(db.plannerBlock, 'updateMany').mockResolvedValue({ count: 2 });

      await tasksService.updateTask('tsk_101', { status: TaskStatus.DONE }, userA_id);

      expect(db.plannerBlock.updateMany).toHaveBeenCalledWith({
        where: { taskId: 'tsk_101' },
        data: { completed: true },
      });

      const plannerEvent = emittedEvents.find(
        (e) => e.target === `workspace:${workspaceA_id}` && e.event === SocketEvent.PLANNER_UPDATED,
      );
      expect(plannerEvent).toBeDefined();
      expect(plannerEvent?.payload.completed).toBe(true);
    });

    it('updating a PlannerBlock to completed: true synchronizes linked Task to DONE', async () => {
      const mockBlock = {
        id: '66666666-6666-4666-a666-666666666666',
        userId: userA_id,
        workspaceId: workspaceA_id,
        taskId: '77777777-7777-4777-a777-777777777777',
        dayKey: '2026-10-09',
        title: 'Deep Focus Block',
        start: 9,
        duration: 60,
        completed: false,
      };

      vi.spyOn(db.plannerBlock, 'findUnique').mockResolvedValue(mockBlock as any);
      vi.spyOn(db.plannerBlock, 'update').mockResolvedValue({ ...mockBlock, completed: true } as any);
      vi.spyOn(db.task, 'update').mockResolvedValue({
        id: mockBlock.taskId,
        status: TaskStatus.DONE,
        workspaceId: workspaceA_id,
        creatorId: userA_id,
      } as any);

      const updatedBlock = await plannerService.updateBlock(userA_id, mockBlock.id, {
        completed: true,
      });

      expect(updatedBlock.completed).toBe(true);
      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: mockBlock.taskId },
        data: expect.objectContaining({ status: TaskStatus.DONE }),
      });

      const taskWsEvent = emittedEvents.find(
        (e) => e.target === `workspace:${workspaceA_id}` && e.event === SocketEvent.TASK_UPDATED,
      );
      expect(taskWsEvent).toBeDefined();
    });

    it('deleting a task unlinks foreign keys from PlannerBlocks and CalendarEvents deterministically', async () => {
      const existingTask = {
        id: '77777777-7777-4777-a777-777777777777',
        title: 'Task to be deleted',
        workspaceId: workspaceA_id,
        creatorId: userA_id,
      };

      vi.spyOn(tasksService, 'getTask').mockResolvedValue(existingTask as any);
      vi.spyOn(db.plannerBlock, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(db.calendarEvent, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(db, '$transaction').mockImplementation(async (cb: any) => cb(db));
      vi.spyOn(db.task, 'update').mockResolvedValue(existingTask as any);

      const success = await tasksService.deleteTask(existingTask.id, userA_id);
      expect(success).toBe(true);

      expect(db.plannerBlock.updateMany).toHaveBeenCalledWith({
        where: { taskId: existingTask.id },
        data: { taskId: null },
      });
      expect(db.calendarEvent.updateMany).toHaveBeenCalledWith({
        where: { taskId: existingTask.id },
        data: { taskId: null },
      });

      const deletedEvent = emittedEvents.find(
        (e) => e.target === `workspace:${workspaceA_id}` && e.event === SocketEvent.TASK_DELETED,
      );
      expect(deletedEvent).toBeDefined();
    });
  });

  // =========================================================================
  // 4. FOCUS ↔ TASK INTEGRATION
  // =========================================================================
  describe('Focus ↔ Task Integration', () => {
    it('completing focus session increments task loggedMinutes and guards against duplicate double-counting', async () => {
      const mockSession = {
        id: '88888888-8888-4888-a888-888888888888',
        userId: userA_id,
        workspaceId: workspaceA_id,
        taskId: '77777777-7777-4777-a777-777777777777',
        status: 'IN_PROGRESS',
        durationMinutes: 25,
        actualDurationSeconds: 0,
        distractionsCount: 0,
        startTime: new Date(),
      };

      vi.spyOn(focusRepo, 'findById').mockResolvedValue(mockSession as any);
      vi.spyOn(focusRepo, 'update').mockImplementation(async (s) => s);

      // 1500 seconds = 25 minutes
      const completed = await focusService.completeSession(mockSession.id, 1500);

      expect(completed.status).toBe('COMPLETED');
      expect(completed.actualDurationSeconds).toBe(1500);

      // Verify realtime emission for focus completion and task update
      const focusCompletedEvent = emittedEvents.find(
        (e) => e.target === `workspace:${workspaceA_id}` && e.event === SocketEvent.FOCUS_COMPLETED,
      );
      expect(focusCompletedEvent).toBeDefined();
      expect(focusCompletedEvent?.payload.actualDurationSeconds).toBe(1500);

      const taskUpdateEvent = emittedEvents.find(
        (e) => e.target === `workspace:${workspaceA_id}` && e.event === SocketEvent.TASK_UPDATED,
      );
      expect(taskUpdateEvent).toBeDefined();

      // DUPLICATE CALL PROTECTION: calling completeSession again returns the session without re-incrementing
      emittedEvents = [];
      const duplicateCall = await focusService.completeSession(mockSession.id, 1500);
      expect(duplicateCall.status).toBe('COMPLETED');
      expect(emittedEvents).toHaveLength(0); // No duplicate emission or increment
    });
  });

  // =========================================================================
  // 5. NOTIFICATIONS ↔ REALTIME INTEGRATION
  // =========================================================================
  describe('Notifications ↔ Realtime Integration', () => {
    it('creates notification in database and emits notification:new directly to user room', async () => {
      const mockNotification = {
        id: 'notif_101',
        userId: userA_id,
        title: 'Task Assigned',
        message: 'You were assigned to a new task',
        type: 'INFO',
        isRead: false,
        createdAt: new Date(),
      };

      vi.spyOn(db.notification, 'create').mockResolvedValue(mockNotification as any);

      const notif = await notificationService.createNotification({
        userId: userA_id,
        title: 'Task Assigned',
        message: 'You were assigned to a new task',
      });

      expect(notif.id).toBe('notif_101');

      const liveEvent = emittedEvents.find(
        (e) => e.target === `user:${userA_id}` && e.event === SocketEvent.NOTIFICATION_NEW,
      );
      expect(liveEvent).toBeDefined();
      expect(liveEvent?.payload.title).toBe('Task Assigned');
    });
  });

  // =========================================================================
  // 6. END-TO-END INTEGRATION SCENARIO (Section 26)
  // =========================================================================
  describe('End-to-End Core Integration Scenario', () => {
    it('executes full flow: Task -> PlannerBlock -> FocusSession -> Completion -> State Convergence', async () => {
      const taskId = '99999999-9999-4999-a999-999999999999';
      const blockId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
      const focusId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

      // 1. Task created in workspace
      const taskRecord = {
        id: taskId,
        title: 'E2E Mission Critical Task',
        status: TaskStatus.TODO,
        workspaceId: workspaceA_id,
        creatorId: userA_id,
        loggedMinutes: 0,
        isCompleted: false,
        completedAt: null,
      };
      vi.spyOn(tasksRepo, 'save').mockResolvedValue(taskRecord as any);
      vi.spyOn(tasksRepo, 'findById').mockResolvedValue(taskRecord as any);

      const task = await tasksService.createTask(
        { title: 'E2E Mission Critical Task', projectId: projectA_id },
        userA_id,
      );
      expect(task.id).toBe(taskId);

      // 2. Planner block created referencing task
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA_id } as any);
      vi.spyOn(db.task, 'findUnique').mockResolvedValue(taskRecord as any);
      vi.spyOn(db.plannerBlock, 'create').mockResolvedValue({
        id: blockId,
        userId: userA_id,
        workspaceId: workspaceA_id,
        dayKey: '2026-10-09',
        title: task.title,
        start: 10,
        duration: 50,
        completed: false,
        taskId: task.id,
        calendarEventId: null,
      } as any);

      const block = await plannerService.createBlock(userA_id, {
        dayKey: '2026-10-09',
        label: task.title,
        taskId: task.id,
      });
      expect(block.id).toBe(blockId);
      expect(block.taskId).toBe(taskId);

      // 3. Focus Session started for task
      vi.spyOn(focusRepo, 'create').mockResolvedValue({
        id: focusId,
        userId: userA_id,
        workspaceId: workspaceA_id,
        taskId,
        status: 'IN_PROGRESS',
        durationMinutes: 50,
        actualDurationSeconds: 0,
        distractionsCount: 0,
      } as any);

      const focus = await focusService.startSession(userA_id, {
        workspaceId: workspaceA_id,
        taskId,
        durationMinutes: 50,
        type: 'focus' as any,
      });
      expect(focus.id).toBe(focusId);

      // 4. Focus Session completed (3000 seconds = 50 minutes logged)
      vi.spyOn(focusRepo, 'findById').mockResolvedValue({
        ...focus,
        status: 'IN_PROGRESS',
      } as any);
      vi.spyOn(focusRepo, 'update').mockImplementation(async (s) => s);

      const completedFocus = await focusService.completeSession(focusId, 3000);
      expect(completedFocus.status).toBe('COMPLETED');

      // 5. Planner Block toggled to completed
      vi.spyOn(db.plannerBlock, 'findUnique').mockResolvedValue({
        id: blockId,
        userId: userA_id,
        workspaceId: workspaceA_id,
        taskId,
        completed: false,
      } as any);
      vi.spyOn(db.plannerBlock, 'update').mockResolvedValue({
        id: blockId,
        userId: userA_id,
        workspaceId: workspaceA_id,
        taskId,
        completed: true,
      } as any);
      vi.spyOn(db.task, 'update').mockResolvedValue({
        ...taskRecord,
        status: TaskStatus.DONE,
        isCompleted: true,
        loggedMinutes: 50,
      } as any);

      const completedBlock = await plannerService.updateBlock(userA_id, blockId, { completed: true });
      expect(completedBlock.completed).toBe(true);

      // Verify the entire sequence produced proper realtime broadcasts across rooms
      const eventNames = emittedEvents.map((e) => e.event);
      expect(eventNames).toContain(SocketEvent.TASK_CREATED);
      expect(eventNames).toContain(SocketEvent.PLANNER_CREATED);
      expect(eventNames).toContain(SocketEvent.FOCUS_STARTED);
      expect(eventNames).toContain(SocketEvent.FOCUS_COMPLETED);
      expect(eventNames).toContain(SocketEvent.PLANNER_UPDATED);
      expect(eventNames).toContain(SocketEvent.TASK_UPDATED);
    });
  });
});
