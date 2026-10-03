import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileFilter } from '../../middleware/upload.middleware.js';
import { documentParser } from '../../modules/ai/rag/ingestion/document-parser.js';
import { UploadService } from '../../modules/upload/upload.service.js';
import { db } from '../../database/client.js';

import fs from 'fs';

// Mock DB
vi.mock('../../database/client.js', () => ({
  db: {
    file: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    fileVersion: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    workspaceMember: {
      findFirst: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock StorageService
vi.mock('../../modules/upload/storage.service', () => ({
  storageService: {
    uploadFile: vi.fn().mockResolvedValue('cloud-path/v1'),
    deleteFile: vi.fn().mockResolvedValue(true),
    getFileBuffer: vi.fn().mockResolvedValue(Buffer.from('restored cloud content')),
  },
}));

describe('Phase 5 — Unified File System Capability & Isolation Tests', () => {
  let uploadService: UploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    uploadService = new UploadService();
  });

  describe('Upload Middleware & Extension Verification', () => {
    it('accepts valid code files (Go, Rust, Python, Java, C++, TSV, etc.)', () => {
      const allowedSamples = [
        { originalname: 'main.go', mimetype: 'text/x-golang' },
        { originalname: 'lib.rs', mimetype: 'text/rust' },
        { originalname: 'App.java', mimetype: 'text/x-java-source' },
        { originalname: 'server.cpp', mimetype: 'text/x-c++src' },
        { originalname: 'index.php', mimetype: 'application/x-httpd-php' },
        { originalname: 'data.tsv', mimetype: 'text/tab-separated-values' },
        { originalname: 'config.toml', mimetype: 'application/toml' },
        { originalname: 'archive.zip', mimetype: 'application/zip' },
        { originalname: 'presentation.pptx', mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      ];

      for (const sample of allowedSamples) {
        let errorResult: any = null;
        let accepted = false;
        fileFilter(
          {} as any,
          sample as any,
          (err: any, pass?: boolean) => {
            errorResult = err;
            accepted = !!pass;
          }
        );
        expect(errorResult).toBeNull();
        expect(accepted).toBe(true);
      }
    });

    it('rejects executable and dangerous files even if spoofed as octet-stream', () => {
      const dangerousSamples = [
        { originalname: 'malware.exe', mimetype: 'application/octet-stream' },
        { originalname: 'script.bat', mimetype: 'application/octet-stream' },
        { originalname: 'payload.dll', mimetype: 'application/octet-stream' },
        { originalname: 'command.cmd', mimetype: 'application/octet-stream' },
        { originalname: 'exploit.vbs', mimetype: 'application/octet-stream' },
      ];

      for (const sample of dangerousSamples) {
        let errorResult: any = null;
        let accepted = false;
        fileFilter(
          {} as any,
          sample as any,
          (err: any, pass?: boolean) => {
            errorResult = err;
            accepted = !!pass;
          }
        );
        expect(errorResult).toBeTruthy();
        expect(accepted).toBe(false);
      }
    });
  });

  describe('Document Parser Coverage', () => {
    it('supports markdown, code, and TSV files via TextBasedParser', () => {
      const testCases = [
        'text/markdown',
        'text/x-markdown',
        'text/tab-separated-values',
        'text/tsv',
        'application/javascript',
        'text/javascript',
        'text/css',
        'text/yaml',
        'text/x-yaml',
        'application/sql',
      ];

      for (const mime of testCases) {
        expect(documentParser.supports(mime)).toBe(true);
      }
    });

    it('extracts text from code and data files correctly', async () => {
      const codeSnippet = 'fn main() { println!("Hello AETHER!"); }';
      const buffer = Buffer.from(codeSnippet, 'utf-8');
      const parseResult = await documentParser.parse({
        id: 'doc-code-1',
        content: buffer,
        mimeType: 'text/plain',
        loadedAt: Date.now(),
        metadata: { filename: 'main.rs' },
      });
      expect(parseResult.ok).toBe(true);
      if (parseResult.ok) {
        expect(parseResult.value.text).toBe(codeSnippet);
      }
    });
  });

  describe('Version History & Project Scoping Protection', () => {
    const validFileId = '77777777-7777-4777-8777-777777777777';
    const validUserId = '11111111-1111-4111-8111-111111111111';
    const validWorkspaceA = '33333333-3333-4333-8333-333333333333';
    const validWorkspaceB = '44444444-4444-4444-8444-444444444444';
    const validProjectA = '55555555-5555-4555-8555-555555555555';
    const validProjectB = '66666666-6666-4666-8666-666666666666';
    const validVersionId = '88888888-8888-4888-8888-888888888888';

    it('enforces project isolation when retrieving file versions', async () => {
      vi.mocked(db.file.findUnique).mockResolvedValue({
        id: validFileId,
        workspaceId: validWorkspaceA,
        projectId: validProjectA,
        originalName: 'report.txt',
      } as any);
      vi.mocked(db.project.findUnique).mockResolvedValue({
        id: validProjectB,
        workspaceId: validWorkspaceA,
        ownerId: validUserId,
      } as any);
      vi.mocked(db.file.findFirst).mockResolvedValue(null);

      // Attempt IDOR from different project
      await expect(
        uploadService.getFileVersions(validFileId, validUserId, {
          projectId: validProjectB,
          workspaceId: validWorkspaceA,
        })
      ).rejects.toThrow();

      // Attempt IDOR from different workspace
      vi.mocked(db.project.findUnique).mockResolvedValue({
        id: validProjectA,
        workspaceId: validWorkspaceA,
        ownerId: validUserId,
      } as any);

      await expect(
        uploadService.getFileVersions(validFileId, validUserId, {
          projectId: validProjectA,
          workspaceId: validWorkspaceB,
        })
      ).rejects.toThrow();
    });

    it('enforces project isolation when restoring a file version', async () => {
      vi.mocked(db.file.findUnique).mockResolvedValue({
        id: validFileId,
        workspaceId: validWorkspaceA,
        projectId: validProjectA,
        originalName: 'report.txt',
      } as any);
      vi.mocked(db.project.findUnique).mockResolvedValue({
        id: validProjectB,
        workspaceId: validWorkspaceA,
        ownerId: validUserId,
      } as any);
      vi.mocked(db.file.findFirst).mockResolvedValue(null);

      await expect(
        uploadService.restoreFileVersion(validFileId, validVersionId, validUserId, {
          projectId: validProjectB,
          workspaceId: validWorkspaceA,
        })
      ).rejects.toThrow();
    });

    it('enforces project isolation when updating file content', async () => {
      vi.mocked(db.file.findUnique).mockResolvedValue({
        id: validFileId,
        workspaceId: validWorkspaceA,
        projectId: validProjectA,
        originalName: 'report.txt',
      } as any);

      await expect(
        uploadService.updateFileContent(validFileId, 'new content', validUserId, {
          projectId: validProjectB,
          workspaceId: validWorkspaceA,
        })
      ).rejects.toThrow(/Forbidden/i);
    });

    it('creates version snapshot and updates content on successful save', async () => {
      const mockFile = {
        id: validFileId,
        userId: validUserId,
        workspaceId: validWorkspaceA,
        projectId: validProjectA,
        originalName: 'script.py',
        mimeType: 'text/x-python',
        path: 'uploads/script.py',
        storagePath: 'script.py',
        size: 50,
      };

      vi.mocked(db.file.findUnique).mockResolvedValue(mockFile as any);
      vi.mocked(db.fileVersion.findFirst).mockResolvedValue(null);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('# Initial Python Script'));
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      vi.mocked(db.fileVersion.create).mockResolvedValue({
        id: validVersionId,
        fileId: validFileId,
        version: 1,
        size: 50,
        createdBy: validUserId,
        createdAt: new Date(),
      } as any);
      vi.mocked(db.file.update).mockResolvedValue({
        ...mockFile,
        size: 100,
      } as any);

      const result = await uploadService.updateFileContent(
        validFileId,
        'print("updated AETHER")',
        validUserId,
        { projectId: validProjectA, workspaceId: validWorkspaceA, comment: 'Added log statement' }
      );

      expect(db.fileVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileId: validFileId,
            version: 1,
            comment: 'Added log statement',
            createdBy: validUserId,
          }),
        })
      );
      expect(db.file.update).toHaveBeenCalled();
      expect(result.file.size).toBe(100);
    });
  });
});
