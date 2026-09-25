import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadService } from '../../modules/upload/upload.service.js';
import { db } from '../../database/client.js';
import { AppError } from '../../middleware/error.middleware.js';

describe('SEC-01 & SEC-02: File Security & Multi-Tenant Isolation', () => {
  let uploadService: UploadService;

  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const workspaceA = '33333333-3333-4333-8333-333333333333';
  const fileId1 = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
    uploadService = new UploadService();
  });

  describe('SEC-01: File Upload Authentication & Ownership', () => {
    it('rejects upload when userId is missing or invalid UUID with 401 UNAUTHORIZED', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test data'),
      } as any;

      await expect(
        uploadService.handleSingleUpload(mockFile, undefined),
      ).rejects.toThrow(AppError);

      await expect(
        uploadService.handleSingleUpload(mockFile, 'invalid-non-uuid-user'),
      ).rejects.toThrowError(/Unauthorized: valid user ID required for upload/);
    });

    it('rejects upload when user is not a member of the specified workspace with 403 FORBIDDEN', async () => {
      const mockFile = {
        originalname: 'secret.png',
        mimetype: 'image/png',
        size: 2048,
        buffer: Buffer.from('secret png data'),
      } as any;

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(
        uploadService.handleSingleUpload(mockFile, userA, workspaceA),
      ).rejects.toThrowError(/Forbidden: you are not a member of this workspace/);
    });

    it('successfully persists file when user is authorized workspace member', async () => {
      const mockFile = {
        originalname: 'verified.txt',
        mimetype: 'text/plain',
        size: 12,
        buffer: Buffer.from('hello world'),
      } as any;

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'wm-1',
        workspaceId: workspaceA,
        userId: userA,
        role: 'MEMBER',
      } as any);

      const createdRecord = {
        id: fileId1,
        filename: 'verified.txt',
        mimeType: 'text/plain',
        size: 12,
        storagePath: 'storage_path_123.txt',
        userId: userA,
        workspaceId: workspaceA,
      };

      vi.spyOn(db.file, 'create').mockResolvedValue(createdRecord as any);

      const result = await uploadService.handleSingleUpload(mockFile, userA, workspaceA);
      expect(result).toBeDefined();
      expect(result.userId).toBe(userA);
      expect(result.workspaceId).toBe(workspaceA);
    });
  });

  describe('SEC-02: File IDOR & Cross-Tenant Isolation', () => {
    it('blocks User B from accessing User A private file with 403 FORBIDDEN', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'userA_private.pdf',
        userId: userA,
        workspaceId: null,
        storagePath: 'disk_userA_private.pdf',
      } as any);

      await expect(
        uploadService.getFileById(fileId1, userB),
      ).rejects.toThrowError(/Unauthorized to access this file/);
    });

    it('allows User A to access their own private file', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'userA_private.pdf',
        userId: userA,
        workspaceId: null,
        storagePath: 'disk_userA_private.pdf',
      } as any);

      const file = await uploadService.getFileById(fileId1, userA);
      expect(file).toBeDefined();
      expect(file?.filename).toBe('userA_private.pdf');
    });

    it('blocks User B from deleting User A private file with 403 FORBIDDEN', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'userA_private.pdf',
        userId: userA,
        workspaceId: null,
        storagePath: 'disk_userA_private.pdf',
      } as any);

      await expect(
        uploadService.deleteFile(fileId1, userB),
      ).rejects.toThrowError(/Unauthorized to delete this file/);
    });

    it('blocks User B from renaming User A private file with 403 FORBIDDEN', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'userA_private.pdf',
        userId: userA,
        workspaceId: null,
      } as any);

      await expect(
        uploadService.renameFile(fileId1, 'hacked_name.pdf', userB),
      ).rejects.toThrowError(/Unauthorized to modify this file/);
    });

    it('allows workspace member with OWNER or ADMIN role to manage workspace file', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'shared_doc.pdf',
        userId: userA,
        workspaceId: workspaceA,
        storagePath: 'shared_doc.pdf',
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue({
        id: 'wm-admin',
        workspaceId: workspaceA,
        userId: userB,
        role: 'ADMIN',
      } as any);

      vi.spyOn(db.file, 'delete').mockResolvedValue({ id: fileId1 } as any);

      const delResult = await uploadService.deleteFile(fileId1, userB);
      expect(delResult.success).toBe(true);
    });

    it('strictly isolates file listing: user with 0 files receives empty array without cross-tenant fallback', async () => {
      vi.spyOn(db.file, 'findMany').mockResolvedValue([]);
      vi.spyOn(db.file, 'count').mockResolvedValue(0);

      const result = await uploadService.listFiles({
        userId: userA,
        page: 1,
        limit: 20,
      });

      expect(result.files).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('strictly blocks unauthorized workspace file listing: returns empty array', async () => {
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      const result = await uploadService.listFiles({
        userId: userB,
        workspaceId: workspaceA,
      });

      expect(result.files).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });
});
