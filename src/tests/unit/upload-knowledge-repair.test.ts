import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { db } from '../../database/client.js';
import { knowledgeRoutes } from '../../routes/knowledge.routes.js';
import { uploadRoutes } from '../../routes/upload.routes.js';
import { uploadController } from '../../modules/upload/upload.controller.js';
import { UploadService } from '../../modules/upload/upload.service.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { securityConfig } from '../../config/index.js';
import { AppError } from '../../middleware/error.middleware.js';

describe('Phase 5: Upload Preview & Knowledge API Production Repair Suite', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const workspaceA = '33333333-3333-4333-8333-333333333333';
  const fileId1 = '44444444-4444-4444-8444-444444444444';
  const notebookId1 = '55555555-5555-4555-8555-555555555555';
  const sectionId1 = '66666666-6666-4666-8666-666666666666';

  let validTokenUserA: string;
  let validTokenUserB: string;

  beforeEach(() => {
    vi.restoreAllMocks();
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
  // 1. ROUTE REGISTRATION & API PREFIX CONTRACTS
  // ==========================================================================
  describe('Route Registration & Contract Integrity', () => {
    it('knowledge routes mount /notebooks GET, POST, GET :id, PATCH :id, DELETE :id', () => {
      const paths = knowledgeRoutes.stack
        .filter((l: any) => l.route)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      expect(paths.some((p) => p.path === '/notebooks' && p.methods.includes('get'))).toBe(true);
      expect(paths.some((p) => p.path === '/notebooks' && p.methods.includes('post'))).toBe(true);
      expect(paths.some((p) => p.path === '/notebooks/:id' && p.methods.includes('get'))).toBe(true);
      expect(paths.some((p) => p.path === '/notebooks/:id' && p.methods.includes('patch'))).toBe(true);
      expect(paths.some((p) => p.path === '/notebooks/:id' && p.methods.includes('delete'))).toBe(true);
      expect(paths.some((p) => p.path === '/notebooks/:notebookId/sections' && p.methods.includes('get'))).toBe(true);
    });

    it('upload routes support both :id and :uploadId for preview and download', () => {
      const paths = uploadRoutes.stack
        .filter((l: any) => l.route)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      expect(paths.some((p) => p.path === '/:id/preview' && p.methods.includes('get'))).toBe(true);
      expect(paths.some((p) => p.path === '/:uploadId/preview' && p.methods.includes('get'))).toBe(true);
      expect(paths.some((p) => p.path === '/:id/download' && p.methods.includes('get'))).toBe(true);
      expect(paths.some((p) => p.path === '/:uploadId/download' && p.methods.includes('get'))).toBe(true);
    });

    it('no duplicate route registrations exist in upload routes', () => {
      const routeKeys = uploadRoutes.stack
        .filter((l: any) => l.route)
        .map((l: any) => `${Object.keys(l.route.methods).join(',')}:${l.route.path}`);

      const set = new Set(routeKeys);
      expect(routeKeys.length).toBe(set.size);
    });
  });

  // ==========================================================================
  // 2. KNOWLEDGE NOTEBOOKS: AUTHENTICATION, ISOLATION & ACCURACY
  // ==========================================================================
  describe('Knowledge Notebooks Endpoints', () => {
    it('returns empty array cleanly when user has no notebooks in DB (no fake data)', async () => {
      vi.spyOn(db.notebook, 'findMany').mockResolvedValue([]);

      const req = {
        user: { id: userA },
        query: {},
      } as any;
      let statusCode = 200;
      let jsonBody: any;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      } as any;
      const next = vi.fn();

      const getNotebooksLayer = knowledgeRoutes.stack.find(
        (l: any) => l.route?.path === '/notebooks' && l.route?.methods?.get,
      );
      await (getNotebooksLayer as any).route.stack[0].handle(req, res, next);

      expect(statusCode).toBe(200);
      expect(jsonBody).toEqual({ success: true, data: [] });
      expect(jsonBody.data).toHaveLength(0);
    });

    it('returns authenticated user notebooks strictly scoped to caller userId', async () => {
      const mockNotebooks = [
        {
          id: notebookId1,
          userId: userA,
          name: 'Engineering Specs',
          description: 'Specs for Q3',
          color: 'blue',
          order: 0,
          isDefault: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.spyOn(db.notebook, 'findMany').mockResolvedValue(mockNotebooks as any);

      const req = {
        user: { id: userA },
      } as any;
      let statusCode = 200;
      let jsonBody: any;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      } as any;
      const next = vi.fn();

      const getNotebooksLayer = knowledgeRoutes.stack.find(
        (l: any) => l.route?.path === '/notebooks' && l.route?.methods?.get,
      );
      await (getNotebooksLayer as any).route.stack[0].handle(req, res, next);

      expect(statusCode).toBe(200);
      expect(jsonBody.success).toBe(true);
      expect(jsonBody.data).toHaveLength(1);
      expect(jsonBody.data[0].id).toBe(notebookId1);
      expect(jsonBody.data[0].userId).toBe(userA);
      expect(db.notebook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: userA, deletedAt: null },
        }),
      );
    });

    it('creates a new notebook with default section atomically', async () => {
      vi.spyOn(db.notebook, 'count').mockResolvedValue(0);
      vi.spyOn(db.notebook, 'create').mockResolvedValue({
        id: notebookId1,
        userId: userA,
        name: 'Product Ideas',
        description: null,
        color: 'indigo',
        order: 0,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.spyOn(db.section, 'count').mockResolvedValue(0);
      vi.spyOn(db.section, 'create').mockResolvedValue({
        id: sectionId1,
        notebookId: notebookId1,
        userId: userA,
        name: 'General',
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const req = {
        user: { id: userA },
        body: { name: 'Product Ideas' },
      } as any;
      let statusCode = 200;
      let jsonBody: any;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      } as any;
      const next = vi.fn();

      const postNotebooksLayer = knowledgeRoutes.stack.find(
        (l: any) => l.route?.path === '/notebooks' && l.route?.methods?.post,
      );
      await (postNotebooksLayer as any).route.stack[0].handle(req, res, next);

      expect(statusCode).toBe(201);
      expect(jsonBody.success).toBe(true);
      expect(jsonBody.data.id).toBe(notebookId1);
      expect(db.section.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notebookId: notebookId1, userId: userA, name: 'General' }),
        }),
      );
    });

    it('rejects unauthenticated requests at router middleware level with 401', async () => {
      const req = {
        headers: {},
        query: {},
      } as any;
      let statusCode = 200;
      let jsonBody: any;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      } as any;
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(statusCode).toBe(401);
      expect(jsonBody.error.code).toBe('UNAUTHORIZED');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. UPLOAD PREVIEW: AUTHENTICATION, IDOR, MIME-TYPES & RESPONSE STREAMING
  // ==========================================================================
  describe('Upload Preview Handler', () => {
    it('successfully streams authorized preview for supported image format', async () => {
      const tempDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempFile = path.join(tempDir, 'test-preview-image.png');
      fs.writeFileSync(tempFile, Buffer.from('fake-png-data'));

      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'diagram.png',
        mimeType: 'image/png',
        size: 13,
        storagePath: 'test-preview-image.png',
        userId: userA,
        workspaceId: null,
      } as any);

      const headers: Record<string, string | number> = {};
      let statusCode = 200;
      const res: any = {
        setHeader: (name: string, value: string | number) => {
          headers[name] = value;
        },
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        send: vi.fn(),
      };
      const pipedStreams: any[] = [];
      res.pipe = vi.fn();

      // Mock createReadStream
      const mockReadStream = {
        on: vi.fn(),
        pipe: vi.fn((destination) => {
          pipedStreams.push(destination);
        }),
      };
      vi.spyOn(fs, 'createReadStream').mockReturnValue(mockReadStream as any);

      const req = {
        params: { uploadId: fileId1 },
        user: { id: userA },
        query: {},
      } as any;
      const next = vi.fn();

      await uploadController.previewFile(req, res, next);

      expect(headers['Content-Type']).toBe('image/png');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Content-Disposition']).toContain('inline');
      expect(mockReadStream.pipe).toHaveBeenCalledWith(res);

      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    });

    it('authenticates preview via query token (?token=...) for browser elements', async () => {
      const req = {
        headers: {},
        query: { token: validTokenUserA },
      } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(userA);
    });

    it('rejects preview access when user is not the owner and not in workspace with 403 FORBIDDEN', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'confidential.pdf',
        mimeType: 'application/pdf',
        size: 500,
        storagePath: 'confidential.pdf',
        userId: userA,
        workspaceId: null,
      } as any);

      const req = {
        params: { id: fileId1 },
        user: { id: userB },
        query: {},
      } as any;
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      let capturedError: any;
      const next = vi.fn((err) => {
        capturedError = err;
      });

      await uploadController.previewFile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(capturedError).toBeInstanceOf(AppError);
      expect(capturedError.statusCode).toBe(403);
      expect(capturedError.errorCode).toBe('FORBIDDEN');
    });

    it('returns 404 FILE_NOT_FOUND when upload record does not exist in database', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue(null);

      const req = {
        params: { uploadId: '00000000-0000-4000-8000-000000000000' },
        user: { id: userA },
        query: {},
      } as any;
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      let capturedError: any;
      const next = vi.fn((err) => {
        capturedError = err;
      });

      await uploadController.previewFile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(capturedError).toBeInstanceOf(AppError);
      expect(capturedError.statusCode).toBe(404);
      expect(capturedError.errorCode).toBe('FILE_NOT_FOUND');
    });

    it('returns 404 FILE_NOT_FOUND safely when physical file is missing from disk and storage provider', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'deleted-from-disk.txt',
        mimeType: 'text/plain',
        size: 100,
        storagePath: 'nonexistent-disk-file-12345.txt',
        userId: userA,
        workspaceId: null,
      } as any);

      const req = {
        params: { id: fileId1 },
        user: { id: userA },
        query: {},
      } as any;
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      let capturedError: any;
      const next = vi.fn((err) => {
        capturedError = err;
      });

      await uploadController.previewFile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(capturedError).toBeInstanceOf(AppError);
      expect(capturedError.statusCode).toBe(404);
      expect(capturedError.errorCode).toBe('FILE_NOT_FOUND');
    });

    it('returns 415 PREVIEW_UNSUPPORTED when preview is requested for unsupported format like .zip or .exe', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'archive.zip',
        mimeType: 'application/zip',
        size: 50000,
        storagePath: 'archive.zip',
        userId: userA,
        workspaceId: null,
      } as any);

      let statusCode = 200;
      let jsonBody: any;
      const res = {
        setHeader: vi.fn(),
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      } as any;
      const req = {
        params: { id: fileId1 },
        user: { id: userA },
        query: {},
      } as any;
      const next = vi.fn();

      await uploadController.previewFile(req, res, next);

      expect(statusCode).toBe(415);
      expect(jsonBody.error.code).toBe('PREVIEW_UNSUPPORTED');
      expect(next).not.toHaveBeenCalled();
    });

    it('preserves existing download endpoint with attachment header for any format', async () => {
      const tempDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempFile = path.join(tempDir, 'test-download-archive.zip');
      fs.writeFileSync(tempFile, Buffer.from('fake-zip-data'));

      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'package.zip',
        mimeType: 'application/zip',
        size: 13,
        storagePath: 'test-download-archive.zip',
        userId: userA,
        workspaceId: null,
      } as any);

      const headers: Record<string, string | number> = {};
      const res: any = {
        setHeader: (name: string, value: string | number) => {
          headers[name] = value;
        },
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };
      const mockReadStream = {
        on: vi.fn(),
        pipe: vi.fn(),
      };
      vi.spyOn(fs, 'createReadStream').mockReturnValue(mockReadStream as any);

      const req = {
        params: { id: fileId1 },
        user: { id: userA },
        query: {},
      } as any;
      const next = vi.fn();

      await uploadController.downloadFile(req, res, next);

      expect(headers['Content-Type']).toBe('application/zip');
      expect(headers['Content-Disposition']).toContain('attachment');
      expect(mockReadStream.pipe).toHaveBeenCalledWith(res);

      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    });

    it('safely handles null storagePath in database without throwing uncaught TypeError 500', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'corrupted-record.txt',
        mimeType: 'text/plain',
        size: 0,
        storagePath: null as any,
        userId: userA,
        workspaceId: null,
      } as any);

      const req = {
        params: { id: fileId1 },
        user: { id: userA },
        query: {},
      } as any;
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      let capturedError: any;
      const next = vi.fn((err) => {
        capturedError = err;
      });

      await uploadController.previewFile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(capturedError).toBeInstanceOf(AppError);
      expect(capturedError.statusCode).toBe(404);
      expect(capturedError.errorCode).toBe('FILE_NOT_FOUND');
    });
  });

  // ==========================================================================
  // 4. REMAINING AUDIT REPAIRS: NOTES AI ROUTES & NULL-SAFE WORKSPACE UPLOADS
  // ==========================================================================
  describe('Remaining Audit Repairs: Notes AI & Upload Null Safety', () => {
    it('knowledge routes mount /notes/:id/ai, /notes/:id/ai-process, and /notes/:id/ai/apply POST', () => {
      const paths = knowledgeRoutes.stack
        .filter((l: any) => l.route)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      expect(paths.some((p) => p.path === '/notes/:id/ai' && p.methods.includes('post'))).toBe(true);
      expect(paths.some((p) => p.path === '/notes/:id/ai-process' && p.methods.includes('post'))).toBe(true);
      expect(paths.some((p) => p.path === '/notes/:id/ai/apply' && p.methods.includes('post'))).toBe(true);
    });

    it('upload single normalizes empty string workspaceId ("") to null without 500 error', async () => {
      const mockCreated = {
        id: fileId1,
        filename: 'test-empty-workspace.txt',
        mimeType: 'text/plain',
        size: 10,
        storagePath: 'test_path.txt',
        status: 'READY',
        userId: userA,
        workspaceId: null,
      };

      vi.spyOn(db.file, 'create').mockResolvedValue(mockCreated as any);

      const service = new UploadService();
      const mockFile = {
        originalname: 'test-empty-workspace.txt',
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('hello world'),
      } as Express.Multer.File;

      const result = await service.handleSingleUpload(mockFile, userA, '   ');

      expect(result).toBeDefined();
      expect(result.workspaceId).toBeNull();
      expect(db.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: null,
            userId: userA,
          }),
        }),
      );
    });

    it('upload single normalizes undefined workspaceId to null without 500 error', async () => {
      const mockCreated = {
        id: fileId1,
        filename: 'test-undefined-workspace.txt',
        mimeType: 'text/plain',
        size: 10,
        storagePath: 'test_path.txt',
        status: 'READY',
        userId: userA,
        workspaceId: null,
      };

      vi.spyOn(db.file, 'create').mockResolvedValue(mockCreated as any);

      const service = new UploadService();
      const mockFile = {
        originalname: 'test-undefined-workspace.txt',
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('hello undefined'),
      } as Express.Multer.File;

      const result = await service.handleSingleUpload(mockFile, userA, undefined);

      expect(result).toBeDefined();
      expect(result.workspaceId).toBeNull();
      expect(db.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: null,
            userId: userA,
          }),
        }),
      );
    });

    it('upload single preserves valid workspace UUID and checks workspace membership', async () => {
      const mockCreated = {
        id: fileId1,
        filename: 'test-workspace.txt',
        mimeType: 'text/plain',
        size: 10,
        storagePath: 'test_path.txt',
        status: 'READY',
        userId: userA,
        workspaceId: workspaceA,
      };

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'member-1',
        workspaceId: workspaceA,
        userId: userA,
        role: 'MEMBER',
      } as any);
      vi.spyOn(db.file, 'create').mockResolvedValue(mockCreated as any);

      const service = new UploadService();
      const mockFile = {
        originalname: 'test-workspace.txt',
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('hello workspace'),
      } as Express.Multer.File;

      const result = await service.handleSingleUpload(mockFile, userA, workspaceA);

      expect(result).toBeDefined();
      expect(result.workspaceId).toBe(workspaceA);
      expect(db.workspaceMember.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: workspaceA, userId: userA },
      });
      expect(db.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: workspaceA,
            userId: userA,
          }),
        }),
      );
    });

    it('upload single rejects invalid non-empty workspaceId format with 400 INVALID_WORKSPACE_ID', async () => {
      const service = new UploadService();
      const mockFile = {
        originalname: 'test-invalid-workspace.txt',
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('hello invalid'),
      } as Express.Multer.File;

      await expect(service.handleSingleUpload(mockFile, userA, 'invalid-non-uuid')).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          errorCode: 'INVALID_WORKSPACE_ID',
        }),
      );
    });
  });
});
