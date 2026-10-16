import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client';
import { TasksService, syncProjectProgress } from '../../modules/projects/tasks/tasks.service';
import { TasksRepository } from '../../modules/projects/tasks/tasks.repository';
import { ProjectsRepository } from '../../modules/projects/projects.repository';
import { ProjectsOrchestrationService } from '../../modules/projects/project.service';
import { ProjectsOrchestrationController } from '../../modules/projects/project.controller';
import { TaskStatus, PriorityLevel } from '../../modules/projects/projects.constants';
import { AppError } from '../../middleware/error.middleware';

describe('AETHER P2A — Task and Project Reliability Verification', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const workspaceA = '33333333-3333-4333-a333-333333333333';
  const workspaceB = '44444444-4444-4444-a444-444444444444';
  const projectA = '55555555-5555-4555-a555-555555555555';
  const projectB = '66666666-6666-4666-a666-666666666666';
  const taskA = '77777777-7777-4777-a777-777777777777';

  let tasksRepo: TasksRepository;
  let tasksService: TasksService;
  let projectsRepo: ProjectsRepository;
  let projectService: ProjectsOrchestrationService;
  let projectController: ProjectsOrchestrationController;

  beforeEach(() => {
    vi.restoreAllMocks();
    tasksRepo = new TasksRepository();
    tasksService = new TasksService(tasksRepo);
    projectsRepo = new ProjectsRepository();
    projectService = {
      projectsRepo,
      getDashboardData: vi.fn().mockResolvedValue({
        stats: { totalProjects: 1, totalTasks: 2, completedTasks: 1 },
        recentProjects: [{ id: projectA, name: 'Core Project' }],
        pendingTasks: [],
        activeGoals: [],
      }),
    } as any;
    projectController = new ProjectsOrchestrationController(projectService);
  });

  // =========================================================================
  // 1. TASK CREATION CONTRACT & PROJECT VALIDATION (P0-1 Fix)
  // =========================================================================
  describe('Task Creation & Project Validation', () => {
    it('creates task successfully with a valid authorized projectId', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA } as any);
      vi.spyOn(db.project, 'findFirst').mockResolvedValue({
        id: projectA,
        ownerId: userA,
        workspaceId: workspaceA,
        workspace: {
          members: [{ userId: userA, role: 'OWNER' }],
        },
      } as any);

      vi.spyOn(db.task, 'create').mockResolvedValue({
        id: taskA,
        title: 'Authorized Task',
        description: 'Testing task persistence',
        projectId: projectA,
        workspaceId: workspaceA,
        creatorId: userA,
        assigneeId: userA,
        status: 'TODO',
        priority: 'MEDIUM',
        dueDate: null,
        labels: ['core'],
        estimatedHours: null,
        loggedMinutes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        comments: [],
      } as any);

      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        { status: 'TODO', completedAt: null },
      ] as any);
      vi.spyOn(db.project, 'update').mockResolvedValue({ id: projectA, progress: 0 } as any);

      const created = await tasksService.createTask(
        {
          title: 'Authorized Task',
          projectId: projectA,
          assigneeIds: [userA],
        },
        userA,
      );

      expect(created).toBeDefined();
      expect(created.projectId).toBe(projectA);
      expect(created.title).toBe('Authorized Task');
    });

    it('rejects task creation when projectId is missing with clear validation error (no 500, no fallback)', async () => {
      await expect(
        tasksService.createTask(
          {
            title: 'Task Without Project',
            projectId: '' as any,
          },
          userA,
        ),
      ).rejects.toThrowError(AppError);

      try {
        await tasksService.createTask(
          {
            title: 'Task Without Project',
            projectId: '' as any,
          },
          userA,
        );
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.errorCode).toBe('INVALID_PROJECT_ID');
      }
    });

    it('rejects task creation when projectId does not exist (404 NOT_FOUND)', async () => {
      vi.spyOn(db.project, 'findFirst').mockResolvedValue(null);

      await expect(
        tasksService.createTask(
          {
            title: 'Task With Ghost Project',
            projectId: '99999999-9999-4999-a999-999999999999',
          },
          userA,
        ),
      ).rejects.toThrowError(AppError);

      try {
        await tasksService.createTask(
          {
            title: 'Task With Ghost Project',
            projectId: '99999999-9999-4999-a999-999999999999',
          },
          userA,
        );
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.errorCode).toBe('PROJECT_NOT_FOUND');
      }
    });

    it('rejects task creation when caller is not owner or member of project workspace (403 FORBIDDEN)', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userB } as any);
      vi.spyOn(db.project, 'findFirst').mockResolvedValue({
        id: projectA,
        ownerId: userA, // Owned by userA
        workspaceId: workspaceA,
        workspace: {
          members: [{ userId: userA, role: 'OWNER' }], // userB is NOT a member
        },
      } as any);

      await expect(
        tasksService.createTask(
          {
            title: 'Unauthorized Intrusion Task',
            projectId: projectA,
          },
          userB, // User B
        ),
      ).rejects.toThrowError(AppError);

      try {
        await tasksService.createTask(
          {
            title: 'Unauthorized Intrusion Task',
            projectId: projectA,
          },
          userB,
        );
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.errorCode).toBe('FORBIDDEN');
      }
    });

    it('tasksRepository.save rejects missing or non-UUID projectId with AppError rather than arbitrary fallback', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: userA } as any);

      await expect(
        tasksRepo.save({
          title: 'Arbitrary Project Test',
          creatorId: userA,
          projectId: undefined,
        }),
      ).rejects.toThrowError(AppError);

      try {
        await tasksRepo.save({
          title: 'Arbitrary Project Test',
          creatorId: userA,
          projectId: undefined,
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.errorCode).toBe('INVALID_PROJECT_ID');
      }
    });
  });

  // =========================================================================
  // 2. PROJECT LISTING & DASHBOARD SPLIT (P0-2 Fix)
  // =========================================================================
  describe('Project Listing vs Dashboard Route Separation', () => {
    it('projectController.list returns project list array in data and projects keys', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      vi.spyOn(projectsRepo, 'findMany').mockResolvedValue({
        data: [
          {
            id: projectA,
            name: 'AETHER Platform',
            description: 'Core engine',
            workspaceId: workspaceA,
            ownerId: userA,
            status: 'ACTIVE',
            priority: 'HIGH',
            progressPercentage: 50,
            members: [{ userId: userA, role: 'OWNER', joinedAt: new Date() }],
            tags: [],
            attachments: [],
            notes: [],
            isArchived: false,
            isFavorite: false,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any,
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const req: any = {
        user: { id: userA, workspaceId: workspaceA },
        headers: {},
        query: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await projectController.list(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          projects: expect.any(Array),
          total: 1,
        }),
      );

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.data.length).toBe(1);
      expect(responseBody.data[0].name).toBe('AETHER Platform');
      expect(responseBody.projects.length).toBe(1);
    });

    it('projectController.list enforces workspace authorization if workspaceId header is provided', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null); // Not a member of workspaceB

      const req: any = {
        user: { id: userA },
        headers: { 'x-workspace-id': workspaceB },
        query: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await projectController.list(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('Forbidden'),
        }),
      );
    });

    it('projectController.getDashboard continues to return dashboard summary metrics', async () => {
      const req: any = {
        user: { id: userA },
        query: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await projectController.getDashboard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            stats: expect.any(Object),
            recentProjects: expect.any(Array),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 3. TASK VISIBILITY & COLLABORATOR / UNASSIGNED FILTERING (P0-3 Fix)
  // =========================================================================
  describe('Task Visibility & Filtering', () => {
    it('returns both unassigned and collaborator tasks within authorized workspace', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any,
      ]);

      const mockTasks = [
        {
          id: 'task-unassigned',
          title: 'Unassigned Backlog Item',
          projectId: projectA,
          workspaceId: workspaceA,
          assigneeId: null, // UNASSIGNED
          status: 'TODO',
          creatorId: userA,
          comments: [],
        },
        {
          id: 'task-collaborator',
          title: 'Collaborator Task',
          projectId: projectA,
          workspaceId: workspaceA,
          assigneeId: userB, // ASSIGNED TO COLLABORATOR
          status: 'IN_PROGRESS',
          creatorId: userA,
          comments: [],
        },
      ];

      vi.spyOn(db.task, 'findMany').mockResolvedValue(mockTasks as any);
      vi.spyOn(db.task, 'count').mockResolvedValue(2);

      const result = await tasksService.listTasks({}, userA);

      expect(result.data.length).toBe(2);
      expect(result.data[0].title).toBe('Unassigned Backlog Item');
      expect(result.data[0].assigneeIds).toEqual([]);
      expect(result.data[1].title).toBe('Collaborator Task');
      expect(result.data[1].assigneeIds).toEqual([userB]);
    });

    it('filters strictly for unassigned tasks when assigneeId is unassigned', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any,
      ]);

      const findManySpy = vi.spyOn(db.task, 'findMany').mockResolvedValue([]);
      vi.spyOn(db.task, 'count').mockResolvedValue(0);

      await tasksService.listTasks({ assigneeId: 'unassigned' }, userA);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assigneeId: null,
            deletedAt: null,
          }),
        }),
      );
    });

    it('blocks access to tasks in unauthorized workspaces (403 FORBIDDEN)', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any, // Only member of workspaceA
      ]);

      await expect(
        tasksService.listTasks({ workspaceId: workspaceB }, userA),
      ).rejects.toThrowError(AppError);
    });
  });

  // =========================================================================
  // 4. REAL PROJECT PROGRESS CALCULATION (P2-3 Fix)
  // =========================================================================
  describe('Project Progress Dynamic Calculation', () => {
    it('calculates project progress as 0% when no tasks exist', async () => {
      vi.spyOn(db.task, 'findMany').mockResolvedValue([]);
      const updateSpy = vi.spyOn(db.project, 'update').mockResolvedValue({} as any);

      const progress = await syncProjectProgress(projectA);

      expect(progress).toBe(0);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: projectA },
        data: { progress: 0 },
      });
    });

    it('calculates project progress accurately from completed ratio (e.g. 1 of 2 = 50%)', async () => {
      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        { status: 'DONE', completedAt: new Date() },
        { status: 'TODO', completedAt: null },
      ] as any);
      const updateSpy = vi.spyOn(db.project, 'update').mockResolvedValue({} as any);

      const progress = await syncProjectProgress(projectA);

      expect(progress).toBe(50);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: projectA },
        data: { progress: 50 },
      });
    });

    it('ignores cancelled tasks in progress denominator', async () => {
      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        { status: 'DONE', completedAt: new Date() },
        { status: 'CANCELLED', completedAt: null },
      ] as any);
      const updateSpy = vi.spyOn(db.project, 'update').mockResolvedValue({} as any);

      const progress = await syncProjectProgress(projectA);

      // 1 active task, 1 completed = 100%
      expect(progress).toBe(100);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: projectA },
        data: { progress: 100 },
      });
    });

    it('ProjectsRepository.findById computes dynamic progress on retrieval', async () => {
      vi.spyOn(db.project, 'findFirst').mockResolvedValue({
        id: projectA,
        name: 'Dynamic Progress Project',
        ownerId: userA,
        workspaceId: workspaceA,
        progress: 0,
        tasks: [
          { status: 'DONE', completedAt: new Date(), deletedAt: null },
          { status: 'DONE', completedAt: new Date(), deletedAt: null },
          { status: 'TODO', completedAt: null, deletedAt: null },
        ],
        workspace: { members: [] },
      } as any);

      const project = await projectsRepo.findById(projectA);

      expect(project).toBeDefined();
      // 2 done out of 3 = 67%
      expect(project?.progressPercentage).toBe(67);
    });
  });
});
