import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../database/client.js';
import { uploadController } from '../../modules/upload/upload.controller.js';
import { UploadService } from '../../modules/upload/upload.service.js';
import { AppError } from '../../middleware/error.middleware.js';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function buildMinimalDocxZip(xml: string): Buffer {
  const nameBytes = Buffer.from('word/document.xml', 'utf-8');
  const raw = Buffer.from(xml, 'utf-8');
  const compressed = zlib.deflateRawSync(raw);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  const entry = Buffer.concat([header, nameBytes, compressed]);
  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  return Buffer.concat([entry, eocd]);
}

describe('Unified File Architecture — Phases 1-4 Verification Suite', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const workspaceId = '33333333-3333-4333-8333-333333333333';
  const projectId = '55555555-5555-4555-8555-555555555555';
  const fileId = '77777777-7777-4777-8777-777777777777';
  const versionId = '88888888-8888-4888-8888-888888888888';

  let uploadService: UploadService;

  beforeEach(() => {
    vi.restoreAllMocks();
    uploadService = new UploadService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // PHASE 1: FILE CONTENT UPDATE & AUTOSAVE BACKEND SUPPORT
  // ==========================================================================
  describe('Phase 1: Content Update (PUT /uploads/:id/content)', () => {
    it('successfully writes updated content to disk and saves previous version', async () => {
      const mockExistingFile = {
        id: fileId,
        filename: 'notes.md',
        mimeType: 'text/markdown',
        size: 50,
        storagePath: 'mock_notes.md',
        userId,
        workspaceId,
        projectId: null,
        versions: [{ version: 1 }],
      };

      vi.spyOn(db.file, 'findUnique').mockResolvedValue(mockExistingFile as any);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('# Initial Content'));
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const mockVersionCreate = vi.spyOn(db.fileVersion, 'create').mockResolvedValue({
        id: versionId,
        fileId,
        version: 2,
        size: 17,
        storagePath: 'versions/mock_version.md',
        createdBy: userId,
        createdAt: new Date(),
        comment: 'Saved version 2',
      } as any);

      const mockFileUpdate = vi.spyOn(db.file, 'update').mockResolvedValue({
        ...mockExistingFile,
        size: 25,
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
      } as any);

      const req: any = {
        params: { id: fileId },
        body: { content: '# New Updated Content', comment: 'Manual update' },
        user: { id: userId },
      };

      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await uploadController.updateFileContent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'File content saved successfully',
          data: expect.objectContaining({ id: fileId }),
          version: expect.objectContaining({ version: 2 }),
        }),
      );
      expect(writeSpy).toHaveBeenCalled();
      expect(mockVersionCreate).toHaveBeenCalled();
      expect(mockFileUpdate).toHaveBeenCalled();
    });

    it('denies update if user lacks authorization to edit the file', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId,
        filename: 'private.txt',
        userId: otherUserId,
        workspaceId,
        projectId: null,
        storagePath: 'private.txt',
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null);

      const req: any = {
        params: { id: fileId },
        body: { content: 'Hacked content' },
        user: { id: userId },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadController.updateFileContent(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          errorCode: 'FORBIDDEN',
        }),
      );
    });
  });

  // ==========================================================================
  // PHASE 1: TEXT EXTRACTION FOR OFFICE DOCUMENTS & CODE
  // ==========================================================================
  describe('Phase 1: Text Extraction (POST /uploads/:id/extract-text)', () => {
    it('extracts text directly from code and markdown files', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId,
        filename: 'script.py',
        mimeType: 'text/x-python',
        storagePath: 'script.py',
        fullPath: '/mock/script.py',
        userId,
      } as any);

      vi.spyOn(UploadService.prototype, 'getFileStreamOrBuffer').mockResolvedValue({
        buffer: Buffer.from('print("hello world")\nresult = 42\n'),
      });

      const req: any = {
        params: { id: fileId },
        user: { id: userId },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadController.extractText(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            text: 'print("hello world")\nresult = 42\n',
            format: 'PY',
            lineCount: 3,
          }),
        }),
      );
    });

    it('handles Office DOCX documents via documentParser without 415 error', async () => {
      const docxXmlContent =
        '<w:document><w:body><w:p><w:r><w:t>Aether System Architecture Executive Summary</w:t></w:r></w:p></w:body></w:document>';

      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId,
        filename: 'QuarterlyReport.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: 'QuarterlyReport.docx',
        fullPath: '/mock/QuarterlyReport.docx',
        userId,
      } as any);

      vi.spyOn(UploadService.prototype, 'getFileStreamOrBuffer').mockResolvedValue({
        buffer: buildMinimalDocxZip(docxXmlContent),
      });

      const req: any = {
        params: { id: fileId },
        user: { id: userId },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadController.extractText(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            text: 'Aether System Architecture Executive Summary',
            format: 'DOCX',
          }),
        }),
      );
    });

    it('preview endpoint extracts text for DOCX and sends text/plain instead of 415', async () => {
      const docxXmlContent =
        '<w:document><w:body><w:p><w:r><w:t>Inline Preview Works</w:t></w:r></w:p></w:body></w:document>';

      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId,
        filename: 'preview_doc.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: 'preview_doc.docx',
        fullPath: '/mock/preview_doc.docx',
        userId,
      } as any);

      vi.spyOn(UploadService.prototype, 'getFileStreamOrBuffer').mockResolvedValue({
        buffer: buildMinimalDocxZip(docxXmlContent),
      });

      const req: any = {
        params: { id: fileId },
        user: { id: userId },
      };
      const res: any = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };
      const next = vi.fn();

      await uploadController.previewFile(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('Inline Preview Works');
    });
  });

  // ==========================================================================
  // PHASE 3: RECENT FILES FROM BACKEND WITH ACCESS TRACKING
  // ==========================================================================
  describe('Phase 3: Recent Files & Access Tracking (GET /uploads/recent)', () => {
    it('returns recent files ordered by access timestamp with unified format', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          filename: 'financials.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 40960,
          lastAccessedAt: new Date('2026-10-03T12:00:00Z'),
          updatedAt: new Date('2026-10-02T10:00:00Z'),
          createdAt: new Date('2026-10-01T08:00:00Z'),
          userId,
          workspaceId,
          projectId: null,
        },
        {
          id: 'file-2',
          filename: 'component.tsx',
          mimeType: 'text/typescript',
          size: 2048,
          lastAccessedAt: new Date('2026-10-03T11:00:00Z'),
          updatedAt: new Date('2026-10-03T11:00:00Z'),
          createdAt: new Date('2026-10-02T08:00:00Z'),
          userId,
          workspaceId,
          projectId,
        },
      ];

      vi.spyOn(db.file, 'findMany').mockResolvedValue(mockFiles as any);

      const req: any = {
        query: { limit: '10' },
        user: { id: userId },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadController.getRecentFiles(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              id: 'file-1',
              name: 'financials.xlsx',
              type: 'spreadsheet',
              location: 'Workspace Files',
            }),
            expect.objectContaining({
              id: 'file-2',
              name: 'component.tsx',
              type: 'code',
              location: 'Project Files',
            }),
          ]),
        }),
      );
    });

    it('records file access asynchronously when file is previewed or retrieved', async () => {
      const updateSpy = vi.spyOn(db.file, 'updateMany').mockResolvedValue({ count: 1 } as any);

      uploadService.recordAccess(fileId);

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: fileId },
          data: { lastAccessedAt: expect.any(Date) },
        }),
      );
    });
  });

  // ==========================================================================
  // PHASE 4: FILE VERSIONING & RESTORATION
  // ==========================================================================
  describe('Phase 4: File Versioning & Restore', () => {
    it('retrieves version history for a file with author information', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId,
        userId,
      } as any);

      vi.spyOn(db.fileVersion, 'findMany').mockResolvedValue([
        {
          id: 'v2-id',
          version: 2,
          size: 1024,
          comment: 'Fixed bug in parser',
          createdAt: new Date('2026-10-03T10:00:00Z'),
          user: { id: userId, fullName: 'Alice Engineer', email: 'alice@aether.ai' },
        },
        {
          id: 'v1-id',
          version: 1,
          size: 800,
          comment: 'Initial draft',
          createdAt: new Date('2026-10-02T10:00:00Z'),
          user: { id: userId, fullName: 'Alice Engineer', email: 'alice@aether.ai' },
        },
      ] as any);

      const req: any = {
        params: { id: fileId },
        user: { id: userId },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadController.getFileVersions(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [
            expect.objectContaining({
              version: 2,
              comment: 'Fixed bug in parser',
              createdBy: 'Alice Engineer',
            }),
            expect.objectContaining({
              version: 1,
              comment: 'Initial draft',
            }),
          ],
        }),
      );
    });

    it('restores historic version by writing content and incrementing version', async () => {
      vi.spyOn(UploadService.prototype, 'getFileById').mockResolvedValue({
        id: fileId,
        userId,
        storagePath: 'active_file.txt',
      } as any);

      vi.spyOn(db.fileVersion, 'findUnique').mockResolvedValue({
        id: versionId,
        fileId,
        version: 1,
        storagePath: 'versions/v1_file.txt',
      } as any);

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('Restored content from V1'));

      const updateContentSpy = vi.spyOn(UploadService.prototype, 'updateFileContent').mockResolvedValue({
        file: { id: fileId, size: 25 } as any,
        version: { version: 3 } as any,
      });

      const req: any = {
        params: { id: fileId, versionId },
        user: { id: userId },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await uploadController.restoreFileVersion(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'File restored successfully to target version',
        }),
      );
      expect(updateContentSpy).toHaveBeenCalledWith(
        fileId,
        'Restored content from V1',
        userId,
        'Restored from Version 1',
      );
    });
  });
});
