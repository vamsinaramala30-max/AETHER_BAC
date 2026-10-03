import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { db } from '../../database/client.js';
import { uploadController } from '../../modules/upload/upload.controller.js';
import { UploadService } from '../../modules/upload/upload.service.js';
import { securityConfig } from '../../config/index.js';
import { AppError } from '../../middleware/error.middleware.js';
import { FileStatus } from '@prisma/client';

describe('Unified File Preview & Project File Isolation Test Suite', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const workspaceA = '33333333-3333-4333-8333-333333333333';
  const workspaceB = '99999999-9999-4999-8999-999999999999';
  const projectA = '55555555-5555-4555-8555-555555555555';
  const projectB = '66666666-6666-4666-8666-666666666666';
  const fileId1 = '77777777-7777-4777-8777-777777777777';
  const fileId2 = '88888888-8888-4888-8888-888888888888';

  let validTokenUserA: string;
  let validTokenUserB: string;
  let uploadService: UploadService;

  beforeEach(() => {
    vi.restoreAllMocks();
    uploadService = new UploadService();
    validTokenUserA = jwt.sign(
      { id: userA, email: 'usera@aether.local', role: 'USER' },
      securityConfig.jwt.secret,
      { expiresIn: '1h' },
    );
    validTokenUserB = jwt.sign(
      { id: userB, email: 'userb@aether.local', role: 'USER' },
      securityConfig.jwt.secret,
      { expiresIn: '1h' },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. GENERAL FILE PREVIEW & STREAMING
  // ==========================================================================
  describe('1. General File Preview & Streaming', () => {
    it('successfully streams authorized preview with inline disposition and nosniff', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId1,
        filename: 'architecture.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storagePath: 'architecture.pdf',
        fullPath: '/mock/architecture.pdf',
        userId: userA,
        workspaceId: workspaceA,
        projectId: null,
      } as any);

      vi.spyOn(UploadService.prototype, 'getFileStreamOrBuffer').mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4 Mock PDF Binary Content'),
      });

      const req = {
        params: { id: fileId1 },
        user: { id: userA },
        query: {},
        headers: {},
      } as any;

      const headers: Record<string, string> = {};
      let statusCode = 200;
      let sentBody: any;

      const res = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        send: (b: any) => {
          sentBody = b;
          return res;
        },
      } as any;

      const next = vi.fn();
      await uploadController.previewFile(req, res, next);

      expect(statusCode).toBe(200);
      expect(headers['Content-Type']).toBe('application/pdf');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Content-Disposition']).toContain('inline');
      expect(sentBody.toString()).toContain('%PDF-1.4');
    });

    it('returns file info metadata for getFileInfo endpoint', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId1,
        filename: 'spec.txt',
        mimeType: 'text/plain',
        size: 512,
        status: FileStatus.READY,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userA,
        workspaceId: workspaceA,
        projectId: projectA,
      } as any);

      const req = {
        params: { id: fileId1 },
        user: { id: userA },
        query: {},
        headers: {},
      } as any;

      let statusCode = 200;
      let jsonBody: any;
      const res = {
        status: (c: number) => {
          statusCode = c;
          return res;
        },
        json: (b: any) => {
          jsonBody = b;
          return res;
        },
      } as any;

      const next = vi.fn();
      await uploadController.getFileInfo(req, res, next);

      expect(statusCode).toBe(200);
      expect(jsonBody.success).toBe(true);
      expect(jsonBody.data.filename).toBe('spec.txt');
      expect(jsonBody.data.projectId).toBe(projectA);
    });
  });

  // ==========================================================================
  // 2. PROJECT UPLOAD WITH PROJECT ID
  // ==========================================================================
  describe('2. Project File Upload with projectId', () => {
    it('persists projectId when user has access to project and workspace', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectA,
        workspaceId: workspaceA,
        ownerId: userA,
        name: 'Alpha Project',
      } as any);

      let createdData: any = null;
      (vi.spyOn(db.file, 'create') as any).mockImplementation(async (args: any) => {
        createdData = args.data;
        return {
          id: fileId1,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      });

      const mockFile = {
        originalname: 'project_brief.md',
        mimetype: 'text/markdown',
        size: 1024,
        buffer: Buffer.from('# Alpha Project Brief'),
      } as Express.Multer.File;

      const result = await uploadService.handleSingleUpload(
        mockFile,
        userA,
        workspaceA,
        projectA,
      );

      expect(result.id).toBe(fileId1);
      expect(createdData.projectId).toBe(projectA);
      expect(createdData.workspaceId).toBe(workspaceA);
      expect(createdData.filename).toBe('project_brief.md');
    });

    it('inherits workspaceId from project if workspaceId was omitted in upload', async () => {
      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectA,
        workspaceId: workspaceA,
        ownerId: userA,
        name: 'Alpha Project',
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      let createdData: any = null;
      (vi.spyOn(db.file, 'create') as any).mockImplementation(async (args: any) => {
        createdData = args.data;
        return { id: fileId1, ...args.data } as any;
      });

      const mockFile = {
        originalname: 'data.json',
        mimetype: 'application/json',
        size: 256,
        buffer: Buffer.from('{"status":"ok"}'),
      } as Express.Multer.File;

      await uploadService.handleSingleUpload(mockFile, userA, null, projectA);

      expect(createdData.workspaceId).toBe(workspaceA);
      expect(createdData.projectId).toBe(projectA);
    });

    it('rejects upload when projectId is not a valid UUID', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      const mockFile = {
        originalname: 'invalid.txt',
        mimetype: 'text/plain',
        size: 50,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(
        uploadService.handleSingleUpload(mockFile, userA, workspaceA, 'invalid-project-id'),
      ).rejects.toThrow('Invalid project ID format');
    });

    it('rejects upload with 404 when project does not exist', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      vi.spyOn(db.project, 'findUnique').mockResolvedValue(null);

      const mockFile = {
        originalname: 'missing.txt',
        mimetype: 'text/plain',
        size: 50,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(
        uploadService.handleSingleUpload(mockFile, userA, workspaceA, projectA),
      ).rejects.toThrow('Project not found');
    });

    it('rejects upload when project belongs to a different workspace (workspace mismatch)', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectB,
        workspaceId: workspaceB, // Different workspace!
        ownerId: userA,
      } as any);

      const mockFile = {
        originalname: 'mismatch.txt',
        mimetype: 'text/plain',
        size: 50,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(
        uploadService.handleSingleUpload(mockFile, userA, workspaceA, projectB),
      ).rejects.toThrow('Project does not belong to specified workspace');
    });

    it('rejects upload when user has no access to the project with 403 FORBIDDEN', async () => {
      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectA,
        workspaceId: workspaceA,
        ownerId: userB, // Owned by User B
      } as any);

      // User A is NOT in workspaceA
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      const mockFile = {
        originalname: 'unauthorized.txt',
        mimetype: 'text/plain',
        size: 50,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(
        uploadService.handleSingleUpload(mockFile, userA, null, projectA),
      ).rejects.toThrow('Forbidden: you do not have access to this project');
    });
  });

  // ==========================================================================
  // 3. PROJECT FILE LISTING
  // ==========================================================================
  describe('3. Project File Listing with projectId', () => {
    it('scopes listFiles query strictly to projectId and workspaceId', async () => {
      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectA,
        workspaceId: workspaceA,
        ownerId: userA,
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'mem-1',
        workspaceId: workspaceA,
        userId: userA,
      } as any);

      let findManyWhere: any = null;
      (vi.spyOn(db.file, 'findMany') as any).mockImplementation(async (args: any) => {
        findManyWhere = args.where;
        return [
          {
            id: fileId1,
            filename: 'proj1.pdf',
            projectId: projectA,
            workspaceId: workspaceA,
          },
        ] as any;
      });
      vi.spyOn(db.file, 'count').mockResolvedValue(1);

      const result = await uploadService.listFiles({
        userId: userA,
        projectId: projectA,
      });

      expect(findManyWhere.projectId).toBe(projectA);
      expect(findManyWhere.workspaceId).toBe(workspaceA);
      expect(result.files.length).toBe(1);
    });

    it('rejects listing when user does not have access to project with 403', async () => {
      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectB,
        workspaceId: workspaceB,
        ownerId: userB,
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      await expect(
        uploadService.listFiles({
          userId: userA,
          projectId: projectB,
        }),
      ).rejects.toThrow('Forbidden: you do not have access to this project');
    });
  });

  // ==========================================================================
  // 4. PROJECT FILE PREVIEW SECURITY & CROSS-PROJECT REJECTION
  // ==========================================================================
  describe('4. Project File Preview Security & Isolation', () => {
    it('allows preview when file belongs to requested project and user has project access', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'diagram.png',
        mimeType: 'image/png',
        storagePath: 'diagram.png',
        userId: userA,
        workspaceId: workspaceA,
        projectId: projectA,
      } as any);

      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectA,
        workspaceId: workspaceA,
        ownerId: userA,
      } as any);

      const result = await uploadService.getFileById(fileId1, userA, projectA);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(fileId1);
      expect(result?.projectId).toBe(projectA);
    });

    it('rejects preview with 403 when file belongs to projectA but caller requests projectB (cross-project attack)', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'secret_spec.pdf',
        mimeType: 'application/pdf',
        storagePath: 'secret_spec.pdf',
        userId: userA,
        workspaceId: workspaceA,
        projectId: projectA, // Actually belongs to Project A
      } as any);

      await expect(
        uploadService.getFileById(fileId1, userA, projectB), // Attacker supplies projectB
      ).rejects.toThrow('Forbidden: file does not belong to specified project');
    });

    it('rejects preview with 403 when file is not a project file but caller asserts projectId', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'personal_file.pdf',
        mimeType: 'application/pdf',
        storagePath: 'personal_file.pdf',
        userId: userA,
        workspaceId: workspaceA,
        projectId: null, // General file, not a project file
      } as any);

      await expect(
        uploadService.getFileById(fileId1, userA, projectA),
      ).rejects.toThrow('Forbidden: file does not belong to specified project');
    });

    it('rejects preview with 403 when caller is from another workspace (cross-tenant rejection)', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'tenant1.pdf',
        mimeType: 'application/pdf',
        storagePath: 'tenant1.pdf',
        userId: userB,
        workspaceId: workspaceB,
        projectId: projectB,
      } as any);

      vi.spyOn(db.project, 'findUnique').mockResolvedValue({
        id: projectB,
        workspaceId: workspaceB,
        ownerId: userB,
      } as any);

      // User A is NOT in workspace B
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      await expect(
        uploadService.getFileById(fileId1, userA),
      ).rejects.toThrow('Forbidden: you do not have access to this project');
    });
  });

  // ==========================================================================
  // 5. FORMAT NEGOTIATION & UNSUPPORTED HANDLING
  // ==========================================================================
  describe('5. Unsupported File Formats & Clean Rejection', () => {
    it('returns HTTP 415 PREVIEW_UNSUPPORTED for .zip and executable archives', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId2,
        filename: 'bundle.zip',
        mimeType: 'application/zip',
        size: 5000,
        storagePath: 'bundle.zip',
        userId: userA,
        workspaceId: workspaceA,
        projectId: null,
      } as any);

      const req = {
        params: { id: fileId2 },
        user: { id: userA },
        query: {},
        headers: {},
      } as any;

      let statusCode = 200;
      let jsonBody: any;
      const res = {
        status: (c: number) => {
          statusCode = c;
          return res;
        },
        json: (b: any) => {
          jsonBody = b;
          return res;
        },
      } as any;

      const next = vi.fn();
      await uploadController.previewFile(req, res, next);

      expect(statusCode).toBe(415);
      expect(jsonBody.error.code).toBe('PREVIEW_UNSUPPORTED');
    });

    it('preserves download endpoint with attachment header for unsupported preview formats', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId2,
        filename: 'archive.tar.gz',
        mimeType: 'application/gzip',
        size: 8000,
        storagePath: 'archive.tar.gz',
        userId: userA,
        workspaceId: workspaceA,
        projectId: null,
      } as any);

      vi.spyOn(UploadService.prototype, 'getFileStreamOrBuffer').mockResolvedValue({
        buffer: Buffer.from('GZIP_BINARY_DATA'),
      });

      const req = {
        params: { id: fileId2 },
        user: { id: userA },
        query: {},
        headers: {},
      } as any;

      const headers: Record<string, string> = {};
      let statusCode = 200;
      let sentBody: any;
      const res = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        status: (c: number) => {
          statusCode = c;
          return res;
        },
        send: (b: any) => {
          sentBody = b;
          return res;
        },
      } as any;

      const next = vi.fn();
      await uploadController.downloadFile(req, res, next);

      expect(statusCode).toBe(200);
      expect(headers['Content-Disposition']).toContain('attachment');
      expect(headers['Content-Disposition']).toContain('archive.tar.gz');
      expect(sentBody.toString()).toBe('GZIP_BINARY_DATA');
    });
  });
});
