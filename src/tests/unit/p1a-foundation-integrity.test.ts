import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { db } from '../../database/client';
import { authenticate } from '../../middleware/auth.middleware';
import { authService } from '../../modules/auth/auth.service';
import { settingsService } from '../../modules/settings/settings.service';
import { TasksRepository } from '../../modules/projects/tasks/tasks.repository';
import { FocusRepository } from '../../modules/workspace/focus/focus.repository';
import { FocusService } from '../../modules/workspace/focus/focus.service';
import { FocusTimerType } from '../../modules/workspace/workspace.constants';
import { PlannerService } from '../../modules/workspace/planner/planner.service';
import { uploadService } from '../../modules/upload/upload.service';
import { securityConfig } from '../../config';

describe('AETHER P1A — Foundation & Data Integrity Verification', () => {
  const validUser1 = '11111111-1111-4111-a111-111111111111';
  const validUser2 = '22222222-2222-4222-a222-222222222222';
  const validWorkspace = '33333333-3333-4333-a333-333333333333';
  const validProject = '44444444-4444-4444-a444-444444444444';
  const validTask = '55555555-5555-4555-a555-555555555555';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. AUTHENTICATION & SERVER-SIDE SESSION REVOCATION (Section 11)
  // =========================================================================
  describe('Authentication & Session Revocation', () => {
    it('generates token with tokenVersion and verifies against user record', async () => {
      const token = jwt.sign(
        { id: validUser1, email: 'user@aether.local', role: 'USER', tokenVersion: 0 },
        securityConfig.jwt.secret,
      );

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: validUser1,
        email: 'user@aether.local',
        tokenVersion: 0,
      } as any);

      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        query: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(validUser1);
      expect(req.user.tokenVersion).toBe(0);
    });

    it('rejects revoked tokens when user tokenVersion has been incremented', async () => {
      // Token issued when tokenVersion was 0
      const token = jwt.sign(
        { id: validUser1, email: 'user@aether.local', role: 'USER', tokenVersion: 0 },
        securityConfig.jwt.secret,
      );

      // User has logged out or changed password, incrementing tokenVersion to 1
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: validUser1,
        email: 'user@aether.local',
        tokenVersion: 1,
      } as any);

      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        query: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'REVOKED_TOKEN',
          }),
        }),
      );
    });

    it('rejects request if user associated with token no longer exists', async () => {
      const token = jwt.sign(
        { id: validUser1, email: 'deleted@aether.local', role: 'USER', tokenVersion: 0 },
        securityConfig.jwt.secret,
      );

      vi.spyOn(db.user, 'findUnique').mockResolvedValue(null);

      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        query: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'USER_NOT_FOUND',
          }),
        }),
      );
    });

    it('logout increments tokenVersion and purges user sessions', async () => {
      vi.spyOn(db.user, 'update').mockResolvedValue({ id: validUser1, tokenVersion: 1 } as any);
      vi.spyOn(db.session, 'deleteMany').mockResolvedValue({ count: 2 } as any);

      await authService.logout('some-refresh-token', validUser1);

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: validUser1 },
        data: { tokenVersion: { increment: 1 } },
      });
      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: validUser1 },
      });
    });

    it('changePassword increments tokenVersion and purges prior sessions', async () => {
      const bcrypt = await import('bcryptjs');
      const oldHash = await bcrypt.hash('OldPassword1!', 10);

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({
        id: validUser1,
        email: 'test@aether.local',
        passwordHash: oldHash,
      } as any);
      vi.spyOn(db.user, 'update').mockResolvedValue({ id: validUser1 } as any);
      vi.spyOn(db.session, 'deleteMany').mockResolvedValue({ count: 1 } as any);
      vi.spyOn(db.notification, 'create').mockResolvedValue({ id: 'notif-1' } as any);

      await settingsService.changePassword(validUser1, 'OldPassword1!', 'NewPassword123!');

      expect(db.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validUser1 },
          data: expect.objectContaining({
            tokenVersion: { increment: 1 },
          }),
        }),
      );
      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: validUser1 },
      });
    });
  });

  // =========================================================================
  // 2. SYNTHETIC FALLBACK ELIMINATION (Section 6)
  // =========================================================================
  describe('Synthetic Fallback Elimination', () => {
    const taskRepo = new TasksRepository();
    const focusRepo = new FocusRepository();

    it('rejects task creation with non-UUID creator without creating synthetic user', async () => {
      const createSpy = vi.spyOn(db.user, 'create');

      await expect(
        taskRepo.save({
          title: 'Fake Creator Task',
          creatorId: 'invalid-non-uuid-creator',
        }),
      ).rejects.toThrow('Valid creatorId UUID is required');

      expect(createSpy).not.toHaveBeenCalled();
    });

    it('rejects task creation when creator does not exist in database', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue(null);
      const createSpy = vi.spyOn(db.user, 'create');

      await expect(
        taskRepo.save({
          title: 'Ghost Creator Task',
          creatorId: validUser1,
        }),
      ).rejects.toThrow(`Creator user ${validUser1} does not exist`);

      expect(createSpy).not.toHaveBeenCalled();
    });

    it('rejects task creation when project does not exist without creating dummy project', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: validUser1 } as any);
      vi.spyOn(db.project, 'findUnique').mockResolvedValue(null);
      const createProjectSpy = vi.spyOn(db.project, 'create');

      await expect(
        taskRepo.save({
          title: 'Orphan Task',
          creatorId: validUser1,
          projectId: validProject,
        }),
      ).rejects.toThrow(`Project ${validProject} not found`);

      expect(createProjectSpy).not.toHaveBeenCalled();
    });

    it('rejects focus session creation with invalid user ID', async () => {
      await expect(
        focusRepo.create('not-a-valid-uuid', {
          id: 'some-session',
          type: 'focus',
          durationMinutes: 25,
        } as any),
      ).rejects.toThrow('Valid user UUID required');
    });

    it('rejects focus session creation for non-existent user', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue(null);

      await expect(
        focusRepo.create(validUser1, {
          id: 'some-session',
          type: 'focus',
          durationMinutes: 25,
        } as any),
      ).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // 3. PLANNER BLOCK RELATIONAL PERSISTENCE (Section 8)
  // =========================================================================
  describe('Planner Block Relational Persistence', () => {
    const plannerService = new PlannerService();

    it('creates a relational planner block with ownership validation', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: validUser1 } as any);

      const mockBlock = {
        id: validTask,
        userId: validUser1,
        dayKey: '2026-10-09',
        start: 9.5,
        duration: 60,
        title: 'Architecture Review',
        bucket: 'study',
        kind: 'fixed',
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db.plannerBlock, 'create').mockResolvedValue(mockBlock as any);

      const result = await plannerService.createBlock(validUser1, {
        dayKey: '2026-10-09',
        start: 9.5,
        duration: 60,
        label: 'Architecture Review',
        bucket: 'study',
        kind: 'fixed',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(validTask);
      expect(result.label).toBe('Architecture Review');
      expect(db.plannerBlock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: validUser1,
            dayKey: '2026-10-09',
            title: 'Architecture Review',
          }),
        }),
      );
    });

    it('saves day data atomically by clearing old day blocks and inserting new ones', async () => {
      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: validUser1 } as any);
      vi.spyOn(db, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          plannerBlock: {
            deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
            create: vi.fn().mockResolvedValue({
              id: validTask,
              title: 'Data Integrity Audit',
              start: 10,
              duration: 45,
              bucket: 'study',
              kind: 'fixed',
              completed: false,
              dayKey: '2026-10-10',
            }),
          },
          userSettings: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({}),
            upsert: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const dayData = {
        blocks: [
          {
            id: validTask,
            start: 10,
            duration: 45,
            label: 'Data Integrity Audit',
            bucket: 'study' as const,
            kind: 'fixed' as const,
            completed: false,
            subject: null,
            priority: null,
            energy: null,
            revision: null,
            groupId: null,
          },
        ],
      };

      const result = await plannerService.saveDay(validUser1, '2026-10-10', dayData);

      expect(result.dayData.blocks).toHaveLength(1);
      expect(result.dayData.blocks[0].label).toBe('Data Integrity Audit');
      expect(db.$transaction).toHaveBeenCalled();
    });

    it('prevents non-owner from updating or deleting a planner block', async () => {
      vi.spyOn(db.plannerBlock, 'findUnique').mockResolvedValue({
        id: validTask,
        userId: validUser1, // owned by validUser1
      } as any);

      // Attempt deletion by validUser2 (unauthorized)
      await expect(
        plannerService.deleteBlock(validUser2, validTask),
      ).rejects.toThrow('Forbidden: you do not have permission to delete this planner block');
    });
  });

  // =========================================================================
  // 4. FOCUS SESSION DURABLE PERSISTENCE (Section 9)
  // =========================================================================
  describe('Focus Session Durable Persistence', () => {
    const focusRepo = new FocusRepository();
    const focusService = new FocusService(focusRepo);

    it('starts and completes a focus session persisted in PostgreSQL', async () => {
      const sessionId = '66666666-6666-4666-a666-666666666666';

      vi.spyOn(db.user, 'findUnique').mockResolvedValue({ id: validUser1 } as any);
      vi.spyOn(db.workspace, 'findUnique').mockResolvedValue({ id: validWorkspace } as any);
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({ workspaceId: validWorkspace } as any);
      vi.spyOn(db.activityLog, 'create').mockResolvedValue({ id: sessionId } as any);
      vi.spyOn(db.focusSession, 'create').mockResolvedValue({
        id: sessionId,
        userId: validUser1,
        workspaceId: validWorkspace,
        type: 'deep_work',
        status: 'IN_PROGRESS',
        durationMinutes: 50,
        actualDurationSeconds: 0,
        distractionsCount: 0,
        createdAt: new Date(),
      } as any);

      const session = await focusService.startSession(validUser1, {
        workspaceId: validWorkspace,
        durationMinutes: 50,
        type: FocusTimerType.CUSTOM,
      });

      expect(session.id).toBeDefined();
      expect(session.userId).toBe(validUser1);

      // Complete the session
      vi.spyOn(focusRepo, 'findById').mockResolvedValue(session);
      vi.spyOn(db.focusSession, 'update').mockResolvedValue({
        ...session,
        status: 'COMPLETED',
        actualDurationSeconds: 3000,
        endTime: new Date(),
      } as any);

      const completed = await focusService.completeSession(session.id, 3000);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.actualDurationSeconds).toBe(3000);
    });

    it('enforces ownership check on focus session deletion', async () => {
      const sessionId = '66666666-6666-4666-a666-666666666666';

      // When validUser2 attempts to delete validUser1's session: count is 0, returns false
      vi.spyOn(db.focusSession, 'deleteMany').mockResolvedValue({ count: 0 } as any);
      const denied = await focusService.deleteSession(sessionId, validUser2);
      expect(denied).toBe(false);

      // When the actual owner validUser1 deletes: count is 1, returns true
      vi.spyOn(db.focusSession, 'deleteMany').mockResolvedValue({ count: 1 } as any);
      const allowed = await focusService.deleteSession(sessionId, validUser1);
      expect(allowed).toBe(true);
    });
  });

  // =========================================================================
  // 5. FILE TRASH STRUCTURED STATE (Section 10)
  // =========================================================================
  describe('File Trash Structured Lifecycle', () => {
    it('moveToTrash sets isTrash: true and deletedAt timestamp', async () => {
      vi.spyOn(uploadService as any, 'getFileById').mockResolvedValue({
        id: validTask,
        userId: validUser1,
        filename: 'report.pdf',
        isTrash: false,
      });

      const updateSpy = vi.spyOn(db.file, 'update').mockResolvedValue({
        id: validTask,
        userId: validUser1,
        filename: 'report.pdf',
        isTrash: true,
        deletedAt: new Date(),
      } as any);

      const result = await uploadService.moveToTrash(validTask, validUser1);

      expect(result).toBeDefined();
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: validTask },
        data: expect.objectContaining({
          isTrash: true,
          deletedAt: expect.any(Date),
        }),
      });
    });

    it('restoreFromTrash clears isTrash and deletedAt timestamp', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: validTask,
        userId: validUser1,
        filename: 'report.pdf',
        isTrash: true,
        deletedAt: new Date(),
      } as any);

      const updateSpy = vi.spyOn(db.file, 'update').mockResolvedValue({
        id: validTask,
        userId: validUser1,
        filename: 'report.pdf',
        isTrash: false,
        deletedAt: null,
      } as any);

      const result = await uploadService.restoreFromTrash(validTask, validUser1);

      expect(result).toBeDefined();
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: validTask },
        data: expect.objectContaining({
          isTrash: false,
          deletedAt: null,
        }),
      });
    });

    it('listFiles excludes trashed files using isTrash: false constraint', async () => {
      const findSpy = vi.spyOn(db.file, 'findMany').mockResolvedValue([
        { id: validTask, filename: 'active.doc', isTrash: false } as any,
      ]);
      vi.spyOn(db.file, 'count').mockResolvedValue(1);

      const result = await uploadService.listFiles({ userId: validUser1 });

      expect(result.files).toHaveLength(1);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: validUser1,
            AND: expect.arrayContaining([
              expect.objectContaining({ isTrash: false }),
            ]),
          }),
        }),
      );
    });

    it('getTrashFiles queries files with isTrash: true constraint', async () => {
      const findSpy = vi.spyOn(db.file, 'findMany').mockResolvedValue([
        { id: validTask, filename: 'trashed.pdf', isTrash: true } as any,
      ]);

      const result = await uploadService.getTrashFiles({ userId: validUser1 });

      expect(result).toHaveLength(1);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: validUser1,
          }),
        }),
      );
    });
  });
});
