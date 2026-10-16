import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client.js';
import { moduleAutomationRoutes } from '../../modules/automation/automation.routes.js';
import { knowledgeRoutes } from '../../routes/knowledge.routes.js';
import { uploadRoutes } from '../../routes/upload.routes.js';
import { calendarApiRoutes } from '../../routes/calendar.routes.js';
import { projectRoutes } from '../../routes/project.routes.js';
import { ProjectsOrchestrationController } from '../../modules/projects/project.controller.js';
import { ProjectsOrchestrationService } from '../../modules/projects/project.service.js';
import { ProjectsModuleSharedRepository } from '../../modules/projects/project.repository.js';
import { AutomationService } from '../../modules/automation/automation.service.js';
import { automationController } from '../../modules/automation/automation.controller.js';
import { uploadController } from '../../modules/upload/upload.controller.js';
import { uploadService } from '../../modules/upload/upload.service.js';

describe('AETHER P5 — System Integration Comprehensive Regression Suite', () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-a222-222222222222';
  const workspaceA = '33333333-3333-4333-a333-333333333333';
  const projectA = '44444444-4444-4444-a444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. INT-02: AUTOMATION EXECUTION & LOGS API ROUTING
  // =========================================================================
  describe('P5-INT-02: Automation Execution & Activity Routing', () => {
    it('contains registered route aliases for execute and logs', () => {
      const routes = moduleAutomationRoutes.stack.map((layer: any) => ({
        path: layer.route?.path,
        methods: layer.route?.methods,
      })).filter((r: any) => r.path);

      const postPaths = routes.filter((r: any) => r.methods?.post).map((r: any) => r.path);
      const getPaths = routes.filter((r: any) => r.methods?.get).map((r: any) => r.path);

      // Verify POST execution routes
      expect(postPaths).toContain('/:id/run');
      expect(postPaths).toContain('/:id/execute');
      expect(postPaths).toContain('/workflows/:id/execute');
      expect(postPaths).toContain('/workflows/:id/run');

      // Verify GET activity & logs routes
      expect(getPaths).toContain('/:id/activity');
      expect(getPaths).toContain('/:id/logs');
      expect(getPaths).toContain('/workflows/:id/activity');
      expect(getPaths).toContain('/workflows/:id/logs');
      expect(getPaths).toContain('/workflows/:id');
    });

    it('runAutomation handles triggerData and returns execution result', async () => {
      vi.spyOn(AutomationService.prototype, 'runAutomation').mockResolvedValue({
        executionId: 'exec-123',
        status: 'SUCCESS',
      } as any);

      const req = {
        params: { id: 'auto-1' },
        user: { id: userA },
        body: { input: { test: true } },
        headers: { 'idempotency-key': 'key-abc' },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();
      await automationController.runAutomation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { executionId: 'exec-123', status: 'SUCCESS' },
      });
      expect(AutomationService.prototype.runAutomation).toHaveBeenCalledWith(
        'auto-1',
        expect.objectContaining({ input: { test: true }, idempotencyKey: 'key-abc' }),
        userA,
      );
    });
  });

  // =========================================================================
  // 2. INT-03: KNOWLEDGE BASE ROOT DOCUMENT CRUD OPERATIONS
  // =========================================================================
  describe('P5-INT-03: Knowledge Base Root Document Operations', () => {
    it('registers root document endpoints in knowledgeRoutes', () => {
      const routes = knowledgeRoutes.stack.map((layer: any) => ({
        path: layer.route?.path,
        methods: layer.route?.methods,
      })).filter((r: any) => r.path);

      const postPaths = routes.filter((r: any) => r.methods?.post).map((r: any) => r.path);
      const getPaths = routes.filter((r: any) => r.methods?.get).map((r: any) => r.path);
      const putPaths = routes.filter((r: any) => r.methods?.put).map((r: any) => r.path);
      const patchPaths = routes.filter((r: any) => r.methods?.patch).map((r: any) => r.path);
      const deletePaths = routes.filter((r: any) => r.methods?.delete).map((r: any) => r.path);

      expect(postPaths).toContain('/');
      expect(getPaths).toContain('/:id');
      expect(putPaths).toContain('/:id');
      expect(patchPaths).toContain('/:id');
      expect(deletePaths).toContain('/:id');
    });
  });

  // =========================================================================
  // 3. INT-04: FILE MANAGER MOVE ROUTE (POST & PATCH SUPPORT)
  // =========================================================================
  describe('P5-INT-04: File Manager Move Route HTTP Methods', () => {
    it('supports both POST and PATCH methods for file move in upload routes', () => {
      const routes = uploadRoutes.stack.map((layer: any) => ({
        path: layer.route?.path,
        methods: layer.route?.methods,
      })).filter((r: any) => r.path);

      const postMove = routes.find((r: any) => r.path === '/:id/move' && r.methods?.post);
      const patchMove = routes.find((r: any) => r.path === '/:id/move' && r.methods?.patch);
      const postMoveUploadId = routes.find((r: any) => r.path === '/:uploadId/move' && r.methods?.post);
      const patchMoveUploadId = routes.find((r: any) => r.path === '/:uploadId/move' && r.methods?.patch);

      expect(postMove).toBeDefined();
      expect(patchMove).toBeDefined();
      expect(postMoveUploadId).toBeDefined();
      expect(patchMoveUploadId).toBeDefined();
    });

    it('uploadController.moveFile successfully moves a file to target folder', async () => {
      vi.spyOn(uploadService, 'moveFile').mockResolvedValue({
        id: 'file-1',
        folderId: 'folder-target',
        name: 'report.pdf',
      } as any);

      const req = {
        params: { id: 'file-1' },
        user: { id: userA },
        body: { folderId: 'folder-target' },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();
      await uploadController.moveFile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 'file-1', folderId: 'folder-target' }),
        }),
      );
    });
  });

  // =========================================================================
  // 4. INT-05: CALENDAR SINGLE CATEGORY QUERY
  // =========================================================================
  describe('P5-INT-05: Calendar Single Category Retrieval & Isolation', () => {
    it('registers GET /:id in calendarApiRoutes', () => {
      const routes = calendarApiRoutes.stack.map((layer: any) => ({
        path: layer.route?.path,
        methods: layer.route?.methods,
      })).filter((r: any) => r.path);

      const getByIdRoute = routes.find((r: any) => r.path === '/:id' && r.methods?.get);
      expect(getByIdRoute).toBeDefined();
    });

    it('returns 404 when calendar belongs to another user or is deleted', async () => {
      vi.spyOn(db.userCalendar, 'findFirst').mockResolvedValue(null);

      // Extract the route handler from calendarApiRoutes
      const layer = calendarApiRoutes.stack.find((l: any) => l.route?.path === '/:id' && l.route?.methods?.get);
      const handler = layer?.route?.stack?.[0]?.handle;
      expect(handler).toBeDefined();

      const req = {
        params: { id: 'cal-unauthorized' },
        user: { id: userA },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();
      await handler!(req, res, next);

      expect(db.userCalendar.findFirst).toHaveBeenCalledWith({
        where: { id: 'cal-unauthorized', userId: userA, deletedAt: null },
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Calendar not found' });
    });

    it('returns the calendar when owned by the requesting user', async () => {
      vi.spyOn(db.userCalendar, 'findFirst').mockResolvedValue({
        id: 'cal-1',
        title: 'Work & Projects',
        color: '#a855f7',
        isPrimary: false,
        isVisible: true,
        userId: userA,
        timeZone: 'UTC',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      } as any);

      const layer = calendarApiRoutes.stack.find((l: any) => l.route?.path === '/:id' && l.route?.methods?.get);
      const handler = layer?.route?.stack?.[0]?.handle;
      expect(handler).toBeDefined();

      const req = {
        params: { id: 'cal-1' },
        user: { id: userA },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();
      await handler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'cal-1',
          title: 'Work & Projects',
          ownerId: userA,
          accessLevel: 'owner',
        }),
      });
    });
  });

  // =========================================================================
  // 5. INT-06: PROJECT MEMBERS QUERY & WORKSPACE AUTHORIZATION
  // =========================================================================
  describe('P5-INT-06: Project Members Query & Authorization', () => {
    it('registers GET /:id/members in projectRoutes', () => {
      const routes = projectRoutes.stack.map((layer: any) => ({
        path: layer.route?.path,
        methods: layer.route?.methods,
      })).filter((r: any) => r.path);

      const membersRoute = routes.find((r: any) => r.path === '/:id/members' && r.methods?.get);
      expect(membersRoute).toBeDefined();
    });

    it('rejects access to project members if user has no membership in project workspace', async () => {
      const repo = new ProjectsModuleSharedRepository();
      const service = new ProjectsOrchestrationService(repo);
      const controller = new ProjectsOrchestrationController(service);

      vi.spyOn(repo.projects, 'findById').mockResolvedValue({
        id: projectA,
        ownerId: userB,
        workspaceId: workspaceA,
        name: 'Private Project',
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      const req = {
        params: { id: projectA },
        user: { id: userA },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();
      await controller.getMembers(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Forbidden: Access to project denied',
      });
    });

    it('returns workspace members when user is authorized', async () => {
      const repo = new ProjectsModuleSharedRepository();
      const service = new ProjectsOrchestrationService(repo);
      const controller = new ProjectsOrchestrationController(service);

      vi.spyOn(repo.projects, 'findById').mockResolvedValue({
        id: projectA,
        ownerId: userA,
        workspaceId: workspaceA,
        name: 'Team Project',
      } as any);

      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        {
          id: 'wm-1',
          userId: userA,
          role: 'OWNER',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          user: {
            id: userA,
            fullName: 'User A',
            email: 'userA@test.com',
            avatarUrl: null,
          },
        },
        {
          id: 'wm-2',
          userId: userB,
          role: 'MEMBER',
          createdAt: new Date('2026-01-02T00:00:00Z'),
          user: {
            id: userB,
            fullName: 'User B',
            email: 'userB@test.com',
            avatarUrl: null,
          },
        },
      ] as any);

      const req = {
        params: { id: projectA },
        user: { id: userA },
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const next = vi.fn();
      await controller.getMembers(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({ userId: userA, role: 'OWNER' }),
            expect.objectContaining({ userId: userB, role: 'MEMBER' }),
          ]),
        }),
      );
    });
  });
});
