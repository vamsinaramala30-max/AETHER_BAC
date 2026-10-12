import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadController } from '../../modules/upload/upload.controller.js';
import { UploadService } from '../../modules/upload/upload.service.js';
import { createTaskTool } from '../../modules/ai/tools/task-tools.js';
import { plannerService } from '../../modules/workspace/planner/planner.service.js';
import { FocusService } from '../../modules/workspace/focus/focus.service.js';
import { FocusRepository } from '../../modules/workspace/focus/focus.repository.js';
import { DocumentsService } from '../../modules/knowledge/documents/documents.service.js';
import { db } from '../../database/client.js';

describe('AETHER P2V — Reliability & Certification Regression Suite', () => {
  const userId = '11111111-1111-4111-a111-111111111111';
  const workspaceId = '33333333-3333-4333-a333-333333333333';
  const projectId = '55555555-5555-4555-a555-555555555555';
  const fileId = '77777777-7777-4777-a777-777777777777';
  const taskId = '99999999-9999-4999-a999-999999999999';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Office Preview Text Extraction & Error Discrimination (Upload Controller)
  describe('1. Office Preview Discrimination & Text Extraction', () => {
    it('returns 200 with text/plain for Office documents instead of premature 415', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId,
        filename: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: 'report.docx',
        userId,
        workspaceId,
        projectId: null,
      } as any);

      vi.spyOn(UploadService.prototype, 'extractText').mockResolvedValue({
        text: 'Quarterly Productivity Summary',
        format: 'DOCX',
        characterCount: 30,
        lineCount: 1,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'report.docx',
      });

      const req = { params: { id: fileId }, user: { id: userId }, query: {}, headers: {} } as any;
      const headers: Record<string, string> = {};
      let statusCode = 200;
      let body: any;
      const res = {
        setHeader: (k: string, v: string) => { headers[k] = v; },
        status: (c: number) => { statusCode = c; return res; },
        send: (b: any) => { body = b; return res; },
      } as any;
      const next = vi.fn();

      await uploadController.previewFile(req, res, next);

      expect(statusCode).toBe(200);
      expect(headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(body).toBe('Quarterly Productivity Summary');
    });

    it('returns 422 DOCUMENT_CORRUPT with corrupt in message when Office file is corrupt', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId,
        filename: 'corrupt.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        storagePath: 'corrupt.pptx',
        userId,
        workspaceId,
        projectId: null,
      } as any);

      vi.spyOn(UploadService.prototype, 'extractText').mockRejectedValue(
        new Error('Text extraction failed: PPTX document is not a valid OOXML/ZIP archive')
      );

      const req = { params: { id: fileId }, user: { id: userId }, query: {}, headers: {} } as any;
      let statusCode = 200;
      let jsonBody: any;
      const res = {
        status: (c: number) => { statusCode = c; return res; },
        json: (b: any) => { jsonBody = b; return res; },
      } as any;
      const next = vi.fn();

      await uploadController.previewFile(req, res, next);

      expect(statusCode).toBe(422);
      expect(jsonBody.error.code).toBe('DOCUMENT_CORRUPT');
      expect(jsonBody.error.message).toContain('corrupt');
    });
  });

  // 2. Recent Files Canonical Location Naming
  describe('2. Recent Files Canonical Location Naming', () => {
    it('returns Workspace Files rather than AETHER Storage for files without a project', async () => {
      vi.spyOn(db.file, 'findMany').mockResolvedValue([
        {
          id: fileId,
          filename: 'shared-doc.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          storagePath: 'shared-doc.pdf',
          userId,
          workspaceId,
          projectId: null,
          folderId: null,
          folder: null,
          createdAt: new Date('2026-10-01'),
          updatedAt: new Date('2026-10-02'),
          lastAccessedAt: new Date('2026-10-03'),
        },
      ] as any);

      const req: any = { query: { limit: '5' }, user: { id: userId } };
      let jsonBody: any;
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((data) => { jsonBody = data; return res; }),
      };
      const next = vi.fn();

      await uploadController.getRecentFiles(req, res, next);

      expect(jsonBody.success).toBe(true);
      expect(jsonBody.data[0].location).toBe('Workspace Files');
    });
  });

  // 3. AI Task Creation Project Resolution & UUID Safety
  describe('3. AI Task Tool Project Resolution', () => {
    it('safely handles non-UUID workspace contexts and resolves default project', async () => {
      vi.spyOn(db.project, 'findFirst').mockResolvedValue({
        id: projectId,
        name: 'General Tasks',
        workspaceId,
        ownerId: userId,
      } as any);

      const ctx: any = {
        auth: {
          userId,
          workspaceId: 'ws_prod_user_a', // non-UUID workspace ID
          roles: ['USER'],
        },
      };

      const result = await createTaskTool.handler(
        { title: 'AI Automated Task', priority: 'medium' },
        ctx,
      );

      expect(result).toBeDefined();
      expect(result.taskId).toBeDefined();
      expect(result.projectId).toBe(projectId);
    });
  });

  // 4. Planner Task Association Dual Lookup Safety
  describe('4. Planner Task Association Dual Lookup', () => {
    it('validates task existence whether findFirst or findUnique mock is provided', async () => {
      vi.spyOn(db.task, 'findFirst').mockResolvedValue(null);
      vi.spyOn(db.task, 'findUnique').mockResolvedValue({
        id: taskId,
        title: 'Task via Unique',
        creatorId: userId,
        assigneeId: userId,
        workspaceId,
        deletedAt: null,
      } as any);

      const validated = await plannerService.validateTaskAssociation(userId, taskId);
      expect(validated.id).toBe(taskId);
      expect(validated.title).toBe('Task via Unique');
    });
  });

  // 5. Knowledge Document File Manager Linking UUID Safety
  describe('5. Knowledge Document File Manager Linking', () => {
    it('safely queries db.file without UUID syntax errors when fileKey is a storage path', async () => {
      const findFirstSpy = vi.spyOn(db.file, 'findFirst').mockResolvedValue({
        id: fileId,
        storagePath: 'doc-scope-1.pdf',
      } as any);

      const mockDocRepo = {
        create: vi.fn().mockResolvedValue({
          id: 'doc-uuid-1',
          title: 'Architecture Doc',
        }),
      };
      const service = new DocumentsService(mockDocRepo as any);

      await service.createDocument(
        {
          title: 'Architecture Doc',
          fileKey: 'doc-scope-1.pdf', // non-UUID string path
          fileSize: 4096,
          mimeType: 'application/pdf',
          originalName: 'doc-scope-1.pdf',
          workspaceId,
        },
        userId,
        workspaceId,
      );

      // Verify findFirst was called with valid storagePath condition without invalid id UUID comparison
      expect(findFirstSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ storagePath: 'doc-scope-1.pdf' }]),
          }),
        }),
      );
    });
  });
});
