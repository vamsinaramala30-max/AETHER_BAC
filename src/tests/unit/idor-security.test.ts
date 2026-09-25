import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TasksService } from '../../modules/projects/tasks/tasks.service.js';
import { GoalsService } from '../../modules/projects/goals/goals.service.js';
import { ProjectsOrchestrationController } from '../../modules/projects/project.controller.js';
import { AutomationService } from '../../modules/automation/automation.service.js';
import { db } from '../../database/client.js';

describe('SEC-03, SEC-04, SEC-05: Entity IDOR & Multi-Tenant Authorization', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const workspaceA = '33333333-3333-4333-8333-333333333333';
  const autoId1 = '55555555-5555-4555-8555-555555555555';
  const autoIdWs1 = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('SEC-03: Task Authorization & IDOR', () => {
    let mockTasksRepo: any;
    let tasksService: TasksService;

    beforeEach(() => {
      mockTasksRepo = {
        findById: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
      };
      tasksService = new TasksService(mockTasksRepo);
    });

    it('blocks User B from reading User A private task with 403 FORBIDDEN', async () => {
      mockTasksRepo.findById.mockResolvedValue({
        id: 'task-1',
        title: 'User A Secret Task',
        creatorId: userA,
        assigneeIds: [userA],
        workspaceId: null,
      });

      await expect(tasksService.getTask('task-1', userB)).rejects.toThrowError(
        /Forbidden: Access to task denied/,
      );
    });

    it('blocks User B from updating User A private task with 403 FORBIDDEN', async () => {
      mockTasksRepo.findById.mockResolvedValue({
        id: 'task-1',
        title: 'User A Secret Task',
        creatorId: userA,
        assigneeIds: [userA],
        workspaceId: null,
      });

      await expect(
        tasksService.updateTask('task-1', { title: 'Hacked Title' }, userB),
      ).rejects.toThrowError(/Forbidden: Access to task denied/);
    });

    it('blocks User B from deleting User A private task with 403 FORBIDDEN', async () => {
      mockTasksRepo.findById.mockResolvedValue({
        id: 'task-1',
        title: 'User A Secret Task',
        creatorId: userA,
        assigneeIds: [userA],
        workspaceId: null,
      });

      await expect(tasksService.deleteTask('task-1', userB)).rejects.toThrowError(
        /Forbidden: Access to task denied/,
      );
    });

    it('allows workspace member to read and update workspace task', async () => {
      mockTasksRepo.findById.mockResolvedValue({
        id: 'task-ws-1',
        title: 'Shared Workspace Task',
        creatorId: userA,
        assigneeIds: [userA],
        workspaceId: workspaceA,
      });

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'wm-b',
        workspaceId: workspaceA,
        userId: userB,
        role: 'MEMBER',
      } as any);

      const task = await tasksService.getTask('task-ws-1', userB);
      expect(task).toBeDefined();
      expect(task.title).toBe('Shared Workspace Task');
    });
  });

  describe('SEC-03: Goal Authorization & IDOR', () => {
    let mockGoalsRepo: any;
    let goalsService: GoalsService;

    beforeEach(() => {
      mockGoalsRepo = {
        findById: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
      };
      goalsService = new GoalsService(mockGoalsRepo);
    });

    it('blocks User B from reading User A private goal with 403 FORBIDDEN', async () => {
      mockGoalsRepo.findById.mockResolvedValue({
        id: 'goal-1',
        title: 'User A Financial Goal',
        userId: userA,
        workspaceId: null,
      });

      await expect(goalsService.getGoal('goal-1', userB)).rejects.toThrowError(
        /Forbidden: Access to goal denied/,
      );
    });

    it('blocks User B from updating User A private goal with 403 FORBIDDEN', async () => {
      mockGoalsRepo.findById.mockResolvedValue({
        id: 'goal-1',
        title: 'User A Financial Goal',
        userId: userA,
        workspaceId: null,
      });

      await expect(
        goalsService.updateGoal('goal-1', { title: 'Tampered Goal' }, userB),
      ).rejects.toThrowError(/Forbidden: Access to goal denied/);
    });

    it('allows workspace member to access shared workspace goal', async () => {
      mockGoalsRepo.findById.mockResolvedValue({
        id: 'goal-ws-1',
        title: 'Workspace Milestone',
        userId: userA,
        workspaceId: workspaceA,
      });

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'wm-b',
        workspaceId: workspaceA,
        userId: userB,
        role: 'MEMBER',
      } as any);

      const goal = await goalsService.getGoal('goal-ws-1', userB);
      expect(goal).toBeDefined();
      expect(goal.title).toBe('Workspace Milestone');
    });
  });

  describe('SEC-04: Project Authorization & IDOR', () => {
    let projectController: ProjectsOrchestrationController;
    let mockOrchestrationService: any;

    beforeEach(() => {
      mockOrchestrationService = {
        projectsRepo: {
          findById: vi.fn(),
          save: vi.fn(),
          delete: vi.fn(),
        },
      };
      projectController = new ProjectsOrchestrationController(mockOrchestrationService);
    });

    it('blocks User B from reading User A private project with 403', async () => {
      mockOrchestrationService.projectsRepo.findById.mockResolvedValue({
        id: 'proj-1',
        name: 'Secret Project A',
        ownerId: userA,
        workspaceId: null,
      });

      const req = {
        params: { id: 'proj-1' },
        user: { id: userB },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await projectController.getById(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('Forbidden'),
        }),
      );
    });

    it('blocks User B from updating User A private project with 403', async () => {
      mockOrchestrationService.projectsRepo.findById.mockResolvedValue({
        id: 'proj-1',
        name: 'Secret Project A',
        ownerId: userA,
        workspaceId: null,
      });

      const req = {
        params: { id: 'proj-1' },
        body: { name: 'Compromised Name' },
        user: { id: userB },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await projectController.update(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('blocks User B from deleting User A private project with 403', async () => {
      mockOrchestrationService.projectsRepo.findById.mockResolvedValue({
        id: 'proj-1',
        name: 'Secret Project A',
        ownerId: userA,
        workspaceId: null,
      });

      const req = {
        params: { id: 'proj-1' },
        user: { id: userB },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await projectController.delete(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows workspace member to read workspace project', async () => {
      mockOrchestrationService.projectsRepo.findById.mockResolvedValue({
        id: 'proj-ws-1',
        name: 'Shared Project',
        ownerId: userA,
        workspaceId: workspaceA,
      });

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'wm-b',
        workspaceId: workspaceA,
        userId: userB,
      } as any);

      const req = {
        params: { id: 'proj-ws-1' },
        user: { id: userB },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await projectController.getById(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ name: 'Shared Project' }),
        }),
      );
    });
  });

  describe('SEC-05: Automation Authorization & IDOR', () => {
    let automationService: AutomationService;

    beforeEach(() => {
      automationService = new AutomationService();
      vi.spyOn((automationService as any).autoRepo, 'findById').mockImplementation(async (id: any) => {
        if (id === autoId1) {
          return {
            id: autoId1,
            name: 'User A Secret Bot',
            userId: userA,
            workspaceId: null,
            isEnabled: true,
          };
        }
        if (id === autoIdWs1) {
          return {
            id: autoIdWs1,
            name: 'Shared Team Bot',
            userId: userA,
            workspaceId: workspaceA,
            isEnabled: true,
          };
        }
        return null;
      });
      vi.spyOn((automationService as any).autoRepo, 'update').mockResolvedValue({
        id: autoId1,
        name: 'Updated Bot',
      } as any);
      vi.spyOn((automationService as any).autoRepo, 'softDelete').mockResolvedValue({
        id: autoId1,
      } as any);
      vi.spyOn((automationService as any).actRepo, 'logActivity').mockResolvedValue({} as any);
    });

    it('blocks User B from accessing User A private automation with 403 FORBIDDEN', async () => {
      await expect(
        automationService.getAutomationById(autoId1, userB),
      ).rejects.toThrowError(/Forbidden: Access to automation denied/);
    });

    it('blocks User B from updating User A private automation with 403 FORBIDDEN', async () => {
      await expect(
        automationService.updateAutomation(autoId1, { name: 'Hacked Bot' }, userB),
      ).rejects.toThrowError(/Forbidden: Access to automation denied/);
    });

    it('blocks User B from deleting User A private automation with 403 FORBIDDEN', async () => {
      await expect(
        automationService.deleteAutomation(autoId1, userB),
      ).rejects.toThrowError(/Forbidden: Access to automation denied/);
    });

    it('allows workspace member to access shared workspace automation', async () => {
      vi.spyOn((automationService as any).prisma.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'wm-b',
        workspaceId: workspaceA,
        userId: userB,
      } as any);

      const auto = await automationService.getAutomationById(autoIdWs1, userB);
      expect(auto).toBeDefined();
      expect(auto.name).toBe('Shared Team Bot');
    });
  });
});
