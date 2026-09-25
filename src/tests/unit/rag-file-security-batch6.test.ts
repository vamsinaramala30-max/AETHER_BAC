import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadService } from '../../modules/upload/upload.service.js';
import { DocumentsService } from '../../modules/knowledge/documents/documents.service.js';
import { DocumentsRepository } from '../../modules/knowledge/documents/documents.repository.js';
import { KnowledgeService } from '../../modules/knowledge/knowledge.service.js';
import { KnowledgeRepository } from '../../modules/knowledge/knowledge.repository.js';
import { InMemoryVectorStore } from '../../modules/ai/rag/retrieval/vector-search.js';
import { InMemoryKeywordIndex } from '../../modules/ai/rag/retrieval/keyword-search.js';
import { Retriever } from '../../modules/ai/rag/retrieval/retriever.js';
import { db } from '../../database/client.js';
import { AppError } from '../../middleware/error.middleware.js';
import { DocumentStatus } from '../../modules/knowledge/knowledge.constants.js';
import { classifyError } from '../../modules/ai/observability/error-taxonomy.js';
import type { IRAGEngine } from '../../modules/ai/rag/rag-engine.js';
import type { DocumentChunk } from '../../modules/ai/rag/rag-types.js';

describe('Batch 6: RAG, File Security & Knowledge Integrity', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const workspaceA = '33333333-3333-4333-8333-333333333333';
  const workspaceB = '44444444-4444-4444-8444-444444444444';
  const docId1 = '55555555-5555-4555-8555-555555555555';
  const fileId1 = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. FILE ACCESS & IDOR SECURITY
  // ==========================================================================
  describe('1. File Access & IDOR Security', () => {
    let uploadService: UploadService;

    beforeEach(() => {
      uploadService = new UploadService();
    });

    it('rejects file access when unauthenticated (missing userId)', async () => {
      await expect(uploadService.getFileById(fileId1, undefined)).rejects.toThrow(AppError);
    });

    it('prevents cross-tenant file download (User B cannot access User A file)', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'confidential_a.pdf',
        userId: userA,
        workspaceId: workspaceA,
        storagePath: 'confidential_a.pdf',
      } as any);

      // User B is NOT in workspace A
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(uploadService.getFileById(fileId1, userB)).rejects.toThrowError(
        /Unauthorized to access this file/,
      );
    });

    it('prevents cross-tenant file deletion', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'contracts.pdf',
        userId: userA,
        workspaceId: workspaceA,
        storagePath: 'contracts.pdf',
      } as any);

      // User B is NOT an owner or admin of workspace A
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(uploadService.deleteFile(fileId1, userB)).rejects.toThrowError(
        /Unauthorized to delete this file/,
      );
    });

    it('prevents cross-tenant file renaming', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue({
        id: fileId1,
        filename: 'report.xlsx',
        userId: userA,
        workspaceId: workspaceA,
        storagePath: 'report.xlsx',
      } as any);

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(
        uploadService.renameFile(fileId1, 'hacked_report.xlsx', userB),
      ).rejects.toThrowError(/Unauthorized to modify this file/);
    });
  });

  // ==========================================================================
  // 2. FILE UPLOAD & PATH TRAVERSAL INTEGRITY
  // ==========================================================================
  describe('2. File Upload & Path Security', () => {
    let uploadService: UploadService;

    beforeEach(() => {
      uploadService = new UploadService();
    });

    it('rejects zero-byte (empty) file uploads with 400 EMPTY_FILE', async () => {
      const emptyFile = {
        originalname: 'empty.txt',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.alloc(0),
      } as any;

      await expect(uploadService.handleSingleUpload(emptyFile, userA)).rejects.toThrowError(
        /Cannot upload empty or invalid file/,
      );
    });

    it('sanitizes malicious path traversal in filenames without crashing', async () => {
      const traversalFile = {
        originalname: '../../../../etc/passwd',
        mimetype: 'text/plain',
        size: 15,
        buffer: Buffer.from('root:x:0:0:root'),
      } as any;

      vi.spyOn(db.file, 'create').mockImplementation((async ({ data }: any) => ({
        id: fileId1,
        ...data,
      })) as any);


      const res = await uploadService.handleSingleUpload(traversalFile, userA);
      expect(res.filename).not.toContain('..');
      expect(res.filename).not.toContain('/');
      expect(res.filename).not.toContain('\\');
      expect(res.filename).toContain('passwd');
    });

    it('rejects rename requests containing path separators', async () => {
      await expect(
        uploadService.renameFile(fileId1, '../evil_name.txt', userA),
      ).rejects.toThrowError(/Valid new filename required without path separators/);
    });
  });

  // ==========================================================================
  // 3. DOCUMENT IDOR & WORKSPACE AUTHORIZATION
  // ==========================================================================
  describe('3. Document Authorization & IDOR Security', () => {
    let docsRepo: DocumentsRepository;
    let docsService: DocumentsService;
    let mockRag: IRAGEngine;

    beforeEach(() => {
      docsRepo = new DocumentsRepository();
      mockRag = {
        ingest: vi.fn().mockResolvedValue({ ok: true, value: { documentId: docId1, chunksCount: 1 } }),
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: { documents: [], citations: [], totalRetrieved: 0, searchQuery: '', estimatedTokens: 0 },
        }),
        deleteDocument: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      } as unknown as IRAGEngine;

      docsService = new DocumentsService(docsRepo, mockRag);
    });

    it('blocks User B from fetching User A private document (403 FORBIDDEN)', async () => {
      vi.spyOn(docsRepo, 'findById').mockResolvedValue({
        id: docId1,
        title: 'User A Secret Strategy',
        ownerId: userA,
        metadata: { fileSize: 100, mimeType: 'text/plain', originalName: 'strategy.txt', workspaceId: workspaceA },
        permissions: { canRead: [userA], canWrite: [userA] },
        status: DocumentStatus.PUBLISHED,
        category: 'General',
        tags: [],
        fileKey: '',
        sharedUserIds: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // User B is not a member of Workspace A
      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(docsService.getDocument(docId1, userB)).rejects.toThrow(AppError);
      await expect(docsService.getDocument(docId1, userB)).rejects.toThrowError(/Access denied to document/);
    });

    it('blocks User B from deleting User A document (403 FORBIDDEN)', async () => {
      vi.spyOn(docsRepo, 'findById').mockResolvedValue({
        id: docId1,
        title: 'User A Doc',
        ownerId: userA,
        metadata: { fileSize: 100, mimeType: 'text/plain', originalName: 'a.txt', workspaceId: workspaceA },
        permissions: { canRead: [userA], canWrite: [userA] },
        status: DocumentStatus.PUBLISHED,
        category: 'General',
        tags: [],
        fileKey: '',
        sharedUserIds: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(db.workspaceMember, 'findFirst').mockResolvedValue(null as any);

      await expect(docsService.deleteDocument(docId1, userB)).rejects.toThrowError(
        /Access denied to delete document/,
      );
    });

    it('returns 404 NOT_FOUND when document does not exist', async () => {
      vi.spyOn(docsRepo, 'findById').mockResolvedValue(null);

      await expect(docsService.getDocument(docId1, userA)).rejects.toThrowError(/not found/);
    });

    it('cascades document deletion to RAGEngine.deleteDocument', async () => {
      vi.spyOn(docsRepo, 'findById').mockResolvedValue({
        id: docId1,
        title: 'Delete Target',
        ownerId: userA,
        metadata: { fileSize: 10, mimeType: 'text/plain', originalName: 'del.txt' },
        permissions: { canRead: [userA], canWrite: [userA] },
        status: DocumentStatus.PUBLISHED,
        category: 'General',
        tags: [],
        fileKey: '',
        sharedUserIds: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(docsRepo, 'delete').mockResolvedValue(true);

      const deleted = await docsService.deleteDocument(docId1, userA);
      expect(deleted).toBe(true);
      expect(mockRag.deleteDocument).toHaveBeenCalledWith(docId1);
      expect(docsRepo.delete).toHaveBeenCalledWith(docId1);
    });
  });

  // ==========================================================================
  // 4. KNOWLEDGE BASE & WORKSPACE ISOLATION IN REPOSITORIES
  // ==========================================================================
  describe('4. Workspace Isolation in Repositories & Analytics', () => {
    let docsRepo: DocumentsRepository;
    let knowledgeService: KnowledgeService;

    beforeEach(() => {
      docsRepo = new DocumentsRepository();
      knowledgeService = new KnowledgeService(new KnowledgeRepository());
    });

    it('documents.findAll rejects queries for unauthorized workspaces', async () => {
      // User A is only member of Workspace A
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any,
      ]);

      // User A tries to list documents from Workspace B
      const result = await docsRepo.findAll({ workspaceId: workspaceB }, userA);
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('documents.findAll scopes query only to accessible workspaces and owned documents', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any,
      ]);

      const findManySpy = vi.spyOn(db.document, 'findMany').mockResolvedValue([]);
      vi.spyOn(db.document, 'count').mockResolvedValue(0);

      await docsRepo.findAll({}, userA);

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { knowledgeBase: { workspaceId: { in: [workspaceA] } } },
              { content: { contains: `"ownerId":"${userA}"` } },
            ]),
          }),
        }),
      );
    });

    it('knowledgeService.getDashboardAnalytics scopes counts strictly to caller workspaces', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any,
      ]);

      const fileCountSpy = vi.spyOn(db.file, 'count').mockResolvedValue(3);
      const docCountSpy = vi.spyOn(db.document, 'count').mockResolvedValue(2);
      const noteCountSpy = vi.spyOn(db.note, 'count').mockResolvedValue(5);
      vi.spyOn(db.project, 'count').mockResolvedValue(1);
      vi.spyOn(db.task, 'count').mockResolvedValue(4);
      vi.spyOn(db.automation, 'count').mockResolvedValue(1);

      const stats = await knowledgeService.getDashboardAnalytics(userA);

      expect(stats.totalKnowledge).toBe(10);
      expect(fileCountSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { userId: userA },
              { workspaceId: { in: [workspaceA] } },
            ]),
          }),
        }),
      );
      expect(docCountSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { knowledgeBase: { workspaceId: { in: [workspaceA] } } },
              { content: { contains: `"ownerId":"${userA}"` } },
            ]),
          }),
        }),
      );
      expect(noteCountSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: expect.arrayContaining([
              { userId: userA },
              { workspaceId: { in: [workspaceA] } },
            ]),
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // 5. VECTOR SEARCH & RETRIEVAL WORKSPACE ISOLATION
  // ==========================================================================
  describe('5. RAG Vector & Keyword Isolation', () => {
    it('InMemoryVectorStore.search enforces strict workspace boundary', async () => {
      const vectorStore = new InMemoryVectorStore();
      const embedding = [0.1, 0.2, 0.3, 0.4];

      // Add chunk from Workspace A
      await vectorStore.upsert([
        {
          id: 'chunk_wsA',
          documentId: 'doc_wsA',
          embedding,
          text: 'Financial revenue quarterly figures for Tenant A',
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 48,
          metadata: { title: 'Tenant A Finance' } as any,
          workspaceId: workspaceA,
          userId: userA,
        },
      ]);

      // Add chunk from Workspace B
      await vectorStore.upsert([
        {
          id: 'chunk_wsB',
          documentId: 'doc_wsB',
          embedding,
          text: 'Financial revenue quarterly figures for Tenant B',
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 48,
          metadata: { title: 'Tenant B Finance' } as any,
          workspaceId: workspaceB,
          userId: userB,
        },
      ]);

      // Query from Workspace A context
      const resultsForWsA = await vectorStore.search(embedding, 5, 0.1, undefined, {
        workspaceId: workspaceA,
      });

      expect(resultsForWsA).toHaveLength(1);
      expect(resultsForWsA[0].chunkId).toBe('chunk_wsA');

      // Query from Workspace B context
      const resultsForWsB = await vectorStore.search(embedding, 5, 0.1, undefined, {
        workspaceId: workspaceB,
      });

      expect(resultsForWsB).toHaveLength(1);
      expect(resultsForWsB[0].chunkId).toBe('chunk_wsB');
    });

    it('InMemoryKeywordIndex.search enforces strict workspace boundary', async () => {
      const keywordIndex = new InMemoryKeywordIndex();

      await keywordIndex.index([
        {
          id: 'chunk_wsA',
          documentId: 'doc_wsA',
          text: 'AETHER deployment guide for Workspace A',
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 39,
          metadata: { title: 'Guide A' } as any,
          workspaceId: workspaceA,
          userId: userA,
        },
      ]);

      await keywordIndex.index([
        {
          id: 'chunk_wsB',
          documentId: 'doc_wsB',
          text: 'AETHER deployment guide for Workspace B',
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 39,
          metadata: { title: 'Guide B' } as any,
          workspaceId: workspaceB,
          userId: userB,
        },
      ]);

      const res = await keywordIndex.search('deployment guide', 5, undefined, {
        workspaceId: workspaceA,
      });
      expect(res).toHaveLength(1);
      expect(res[0].chunkId).toBe('chunk_wsA');
    });

    it('Retriever.resolveChunks filters out unauthorized cross-workspace chunks', async () => {
      const mockVectorStore = {
        search: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
        deleteByDocumentId: vi.fn(),
        clear: vi.fn(),
      };
      const mockKeywordIndex = {
        search: vi.fn().mockResolvedValue([]),
        index: vi.fn(),
        deleteByDocumentId: vi.fn(),
        clear: vi.fn(),
      };
      const mockChunkStore = {
        getById: vi.fn().mockResolvedValue({
          id: 'c1',
          documentId: 'd1',
          text: 'Secret doc from wsB',
          workspaceId: workspaceB, // Different workspace!
          userId: userB,
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 19,
          metadata: {},
        }),
        save: vi.fn(),
        getByDocumentId: vi.fn(),
        deleteByDocumentId: vi.fn(),
      };
      const mockEmbedding = {
        embed: vi.fn().mockResolvedValue({ ok: true, value: { vector: [0.1, 0.2], dimensions: 2 } }),
      };
      const mockReranker = {
        rerank: vi.fn().mockImplementation(async (req) => req.candidates.map((c: any) => ({ chunk: c, score: 0.9 }))),
      };

      const retriever = new Retriever(
        mockEmbedding as any,
        mockVectorStore as any,
        mockKeywordIndex as any,
        mockChunkStore as any,
        mockReranker as any,
        { hybridSearchAlpha: 0.5 } as any,
      );

      // Caller is in Workspace A
      const chunks = await (retriever as any).resolveChunks(
        ['c1'],
        { workspaceId: workspaceA, userId: userA },
      );

      // Should be filtered out because chunk belongs to workspaceB
      expect(chunks).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 6. TRUTHFUL PROCESSING STATES & FAILURE BEHAVIOR
  // ==========================================================================
  describe('6. Truthful Processing States', () => {
    it('sets status to INDEX_FAILED when RAG ingestion fails', async () => {
      const docsRepo = new DocumentsRepository();
      const mockRag: IRAGEngine = {
        ingest: vi.fn().mockResolvedValue({ ok: false, error: new Error('Embedding service failed') }),
        query: vi.fn(),
        deleteDocument: vi.fn(),
      } as unknown as IRAGEngine;

      const docsService = new DocumentsService(docsRepo, mockRag);

      vi.spyOn(docsRepo, 'create').mockResolvedValue({
        id: docId1,
        title: 'Failed Document',
        description: 'Important text to ingest',
        status: DocumentStatus.PROCESSING,
        category: 'General',
        tags: [],
        fileKey: '',
        metadata: { fileSize: 50, mimeType: 'text/plain', originalName: 'failed.txt' },
        ownerId: userA,
        sharedUserIds: [],
        permissions: { canRead: [userA], canWrite: [userA] },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updateSpy = vi.spyOn(docsRepo, 'update').mockResolvedValue({
        id: docId1,
        title: 'Failed Document',
        status: DocumentStatus.INDEX_FAILED,
        category: 'General',
        tags: [],
        fileKey: '',
        metadata: { fileSize: 50, mimeType: 'text/plain', originalName: 'failed.txt' },
        ownerId: userA,
        sharedUserIds: [],
        permissions: { canRead: [userA], canWrite: [userA] },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await docsService.createDocument(
        {
          title: 'Failed Document',
          description: 'Important text to ingest',
          fileKey: '',
          fileSize: 50,
          mimeType: 'text/plain',
          originalName: 'failed.txt',
        },
        userA,
      );

      expect(res.status).toBe(DocumentStatus.INDEX_FAILED);
      expect(updateSpy).toHaveBeenCalledWith(docId1, { status: DocumentStatus.INDEX_FAILED }, undefined);
    });
  });

  // ==========================================================================
  // 7. ERROR TAXONOMY & SENSITIVE DATA DEFENSE
  // ==========================================================================
  describe('7. Error Taxonomy & Sensitive Data Defense', () => {
    it('classifies "Access denied to document." as AUTHORIZATION_ERROR (HTTP 403)', () => {
      const err = new Error('Access denied to document.');
      const classified = classifyError(err);
      expect(classified.code).toBe('AUTHORIZATION_ERROR');
      expect(classified.statusCode).toBe(403);
      expect(classified.toSafeJSON().error).toEqual(
        expect.objectContaining({
          code: 'AUTHORIZATION_ERROR',
        }),
      );
    });

    it('classifies AppError FORBIDDEN as AUTHORIZATION_ERROR (HTTP 403)', () => {
      const err = new AppError('Unauthorized to access this file', 403, 'FORBIDDEN');
      const classified = classifyError(err);
      expect(classified.code).toBe('AUTHORIZATION_ERROR');
      expect(classified.statusCode).toBe(403);
    });

    it('does not leak database connection strings or internal paths in safe error JSON', () => {
      const err = new AppError(
        'postgresql://postgres:secret123@localhost:5432/aether: connection error at C:\\Server\\data',
        500,
        'INTERNAL_ERROR',
      );
      const classified = classifyError(err);
      const safe = classified.toSafeJSON();
      expect(JSON.stringify(safe)).not.toContain('secret123');
      expect(JSON.stringify(safe)).not.toContain('C:\\Server');
    });
  });
});
