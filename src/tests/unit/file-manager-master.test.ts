import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadService } from '../../modules/upload/upload.service.js';
import { db } from '../../database/client.js';
import { AppError } from '../../middleware/error.middleware.js';

describe('AETHER File Manager — Backend Master Capabilities Test Suite', () => {
  let uploadService: UploadService;

  const testUser = '11111111-1111-4111-8111-111111111111';
  const otherUser = '22222222-2222-4222-8222-222222222222';
  const testWorkspace = '33333333-3333-4333-8333-333333333333';
  const testFolderId = '44444444-4444-4444-8444-444444444444';
  const testFileId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    vi.restoreAllMocks();
    uploadService = new UploadService();
  });

  describe('Folder Hierarchy & Operations', () => {
    it('creates a new folder with valid parameters', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        workspaceId: testWorkspace,
        userId: testUser,
      } as any);

      vi.spyOn(db.folder, 'create').mockResolvedValue({
        id: testFolderId,
        name: 'Documentation',
        parentId: null,
        workspaceId: testWorkspace,
        userId: testUser,
        type: 'FILES',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const folder = await uploadService.createFolder({
        userId: testUser,
        name: 'Documentation',
        workspaceId: testWorkspace,
      });

      expect(folder.name).toBe('Documentation');
      expect(folder.userId).toBe(testUser);
      expect(db.folder.create).toHaveBeenCalled();
    });

    it('rejects folder creation with invalid path separators', async () => {
      await expect(
        uploadService.createFolder({
          userId: testUser,
          name: 'invalid/nested/path',
        }),
      ).rejects.toThrowError(/Valid folder name required without path separators/);
    });

    it('renames an existing folder when authorized', async () => {
      vi.spyOn(db.folder, 'findUnique').mockResolvedValue({
        id: testFolderId,
        userId: testUser,
        name: 'Old Name',
      } as any);

      vi.spyOn(db.folder, 'update').mockResolvedValue({
        id: testFolderId,
        name: 'New Name',
      } as any);

      const updated = await uploadService.renameFolder(testFolderId, 'New Name', testUser);
      expect(updated.name).toBe('New Name');
    });

    it('prevents another user from renaming a private folder', async () => {
      vi.spyOn(db.folder, 'findUnique').mockResolvedValue({
        id: testFolderId,
        userId: testUser,
        name: 'Confidential',
      } as any);

      await expect(
        uploadService.renameFolder(testFolderId, 'Hacked', otherUser),
      ).rejects.toThrowError(/Forbidden: you do not own this folder/);
    });

    it('retrieves hierarchical folder breadcrumbs', async () => {
      const parentId = '66666666-6666-4666-8666-666666666666';
      vi.spyOn(db.folder, 'findUnique')
        .mockResolvedValueOnce({
          id: testFolderId,
          name: 'Reports',
          parentId,
          userId: testUser,
        } as any)
        .mockResolvedValueOnce({
          id: parentId,
          name: 'AETHER',
          parentId: null,
          userId: testUser,
        } as any);

      const breadcrumbs = await uploadService.getFolderBreadcrumbs(testFolderId, testUser);
      expect(breadcrumbs).toHaveLength(2);
      expect(breadcrumbs[0].name).toBe('AETHER');
      expect(breadcrumbs[1].name).toBe('Reports');
    });
  });

  describe('Trash Lifecycle (Soft-Delete, Restore, Empty)', () => {
    it('moves a file to trash with timestamp marker and unsets folder', async () => {
      vi.spyOn(uploadService, 'getFileById').mockResolvedValue({
        id: testFileId,
        filename: 'ProjectNotes.md',
        folderId: testFolderId,
      } as any);

      vi.spyOn(db.file, 'update').mockImplementation(((args: any) => {
        return Promise.resolve({
          id: testFileId,
          filename: 'ProjectNotes.md',
          description: args.data.description,
          folderId: args.data.folderId,
        });
      }) as any);

      const trashed = await uploadService.moveToTrash(testFileId, testUser);
      expect(trashed.description).toContain('__TRASH__:');
      expect(trashed.folderId).toBeNull();
    });

    it('restores a trashed file back to its original folder', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: testFileId,
        userId: testUser,
        filename: 'ProjectNotes.md',
        description: `__TRASH__:2026-10-04T12:00:00.000Z:${testFolderId}`,
      } as any);

      vi.spyOn(db.folder, 'findUnique').mockResolvedValue({
        id: testFolderId,
        name: 'Documentation',
      } as any);

      vi.spyOn(db.file, 'update').mockResolvedValue({
        id: testFileId,
        filename: 'ProjectNotes.md',
        description: null,
        folderId: testFolderId,
      } as any);

      const restored = await uploadService.restoreFromTrash(testFileId, testUser);
      expect(restored.description).toBeNull();
      expect(restored.folderId).toBe(testFolderId);
    });

    it('lists trashed files with parsed deletion metadata', async () => {
      vi.spyOn(db.file, 'findMany').mockResolvedValue([
        {
          id: testFileId,
          filename: 'OldReport.pdf',
          mimeType: 'application/pdf',
          size: 4096,
          description: '__TRASH__:2026-10-04T10:00:00.000Z:root',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);

      const trashList = await uploadService.getTrashFiles({ userId: testUser });
      expect(trashList).toHaveLength(1);
      expect(trashList[0].filename).toBe('OldReport.pdf');
      expect(trashList[0].trashedAt).toBe('2026-10-04T10:00:00.000Z');
      expect(trashList[0].originalFolderId).toBeNull();
    });
  });

  describe('File Moving & Duplication', () => {
    it('moves a file into a designated target folder', async () => {
      vi.spyOn(uploadService, 'getFileById').mockResolvedValue({
        id: testFileId,
        filename: 'Document.docx',
      } as any);

      vi.spyOn(db.folder, 'findUnique').mockResolvedValue({
        id: testFolderId,
        userId: testUser,
      } as any);

      vi.spyOn(db.file, 'update').mockResolvedValue({
        id: testFileId,
        filename: 'Document.docx',
        folderId: testFolderId,
      } as any);

      const moved = await uploadService.moveFile(testFileId, testUser, testFolderId);
      expect(moved.folderId).toBe(testFolderId);
    });
  });

  describe('Storage Insights & Duplicate Detection', () => {
    it('computes categorized storage statistics accurately', async () => {
      vi.spyOn(db.file, 'findMany').mockResolvedValue([
        { id: '1', filename: 'photo.png', mimeType: 'image/png', size: 1000 },
        { id: '2', filename: 'clip.mp4', mimeType: 'video/mp4', size: 5000 },
        { id: '3', filename: 'notes.txt', mimeType: 'text/plain', size: 500 },
        { id: '4', filename: 'script.py', mimeType: 'text/x-python', size: 200 },
      ] as any);

      const insights = await uploadService.getStorageInsights({ userId: testUser });
      expect(insights.totalBytes).toBe(6700);
      expect(insights.totalFiles).toBe(4);

      const imageCat = insights.categories.find((c) => c.name === 'images');
      expect(imageCat?.bytes).toBe(1000);
      expect(imageCat?.count).toBe(1);

      const videoCat = insights.categories.find((c) => c.name === 'video');
      expect(videoCat?.bytes).toBe(5000);
      expect(videoCat?.count).toBe(1);
    });

    it('identifies duplicate files by size and matching filename stem', async () => {
      vi.spyOn(db.file, 'findMany').mockResolvedValue([
        { id: '1', filename: 'presentation.pptx', size: 10240, createdAt: new Date() },
        { id: '2', filename: 'presentation (Copy).pptx', size: 10240, createdAt: new Date() },
        { id: '3', filename: 'unique_doc.pdf', size: 2048, createdAt: new Date() },
      ] as any);

      const duplicates = await uploadService.getDuplicateFiles({ userId: testUser });
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].files).toHaveLength(2);
      expect(duplicates[0].size).toBe(10240);
    });
  });

  describe('Ask AI About File', () => {
    it('analyzes file content and answers summarize question truthfully', async () => {
      vi.spyOn(uploadService, 'getFileById').mockResolvedValue({
        id: testFileId,
        filename: 'Architecture.md',
        mimeType: 'text/markdown',
        size: 512,
      } as any);

      vi.spyOn(uploadService, 'extractText').mockResolvedValue({
        text: 'AETHER is an intelligent agentic workspace.\n\nIt features File Manager, Goals, and Task automation.',
      } as any);

      const result = await uploadService.askAIAboutFile(
        testFileId,
        testUser,
        'Summarize this document',
      );

      expect(result.fileId).toBe(testFileId);
      expect(result.filename).toBe('Architecture.md');
      expect(result.answer).toContain('Summary of "Architecture.md"');
      expect(result.metrics.words).toBeGreaterThan(0);
    });
  });
});
