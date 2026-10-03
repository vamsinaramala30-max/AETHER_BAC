import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentsService } from '../../modules/knowledge/documents/documents.service.js';
import { AiExpressController } from '../../modules/ai/ai.module.js';
import { db } from '../../database/client.js';
import { aiRoutes } from '../../routes/ai.routes.js';
import { knowledgeRoutes } from '../../routes/knowledge.routes.js';

describe('AETHER Phase 1: Authentication & 401 Remediation Unit Suite', () => {
  describe('DocumentsService RAG Retrieval', () => {
    let documentsService: DocumentsService;
    let mockRagEngine: any;

    beforeEach(() => {
      vi.restoreAllMocks();
      mockRagEngine = {
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            documents: [
              {
                chunkId: 'chunk-123',
                documentId: 'doc-456',
                content: 'Authenticated Aether architecture documentation',
                score: 0.95,
                metadata: { title: 'Architecture' },
              },
            ],
            totalMatches: 1,
            retrievalTimeMs: 12,
          },
        }),
      };
      documentsService = new DocumentsService({} as any, mockRagEngine);
    });

    it('successfully queries RAG engine with workspace and user scoping', async () => {
      const result = await documentsService.retrieve({
        queryText: 'how does Aether auth work?',
        workspaceId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        topK: 5,
        scoreThreshold: 0.7,
      });

      expect(mockRagEngine.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'how does Aether auth work?',
          workspaceId: '11111111-1111-4111-8111-111111111111',
          userId: '22222222-2222-4222-8222-222222222222',
          topK: 5,
          scoreThreshold: 0.7,
        })
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.documents.length).toBe(1);
        expect(result.value.documents[0].documentId).toBe('doc-456');
      }
    });

    it('rejects retrieval when userId is missing', async () => {
      const result = await documentsService.retrieve({
        queryText: 'test',
        userId: '',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('Prompt Library Persistence & Ownership', () => {
    let controller: AiExpressController;
    const testUserId = '11111111-1111-4111-8111-111111111111';
    const testWorkspaceId = '22222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      vi.restoreAllMocks();
      controller = new AiExpressController();
    });

    it('saves a prompt scoped to authenticated user and workspace', async () => {
      const promptData = {
        title: 'Architecture Reviewer',
        template: 'Review the architecture strictly according to guidelines.',
        category: 'ENGINEERING',
      };

      const req = {
        user: { id: testUserId, workspaceId: testWorkspaceId },
        body: promptData,
      } as any;

      let responseCode = 200;
      let responseBody: any;
      const res = {
        status: (code: number) => {
          responseCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      } as any;
      const next = vi.fn();

      vi.spyOn(db.aIMemory, 'upsert').mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        userId: testUserId,
        category: 'PROMPT',
        content: promptData.template,
        metadata: {
          title: promptData.title,
          category: promptData.category,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await controller.savePrompt(req, res, next);

      expect(responseCode).toBe(200);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.title).toBe('Architecture Reviewer');
      expect(responseBody.data.template).toBe(promptData.template);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects saving a prompt when unauthenticated with 401', async () => {
      const req = {
        user: null,
        body: { title: 'Test' },
      } as any;

      let responseCode = 200;
      let responseBody: any;
      const res = {
        status: (code: number) => {
          responseCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      } as any;
      const next = vi.fn();

      await controller.savePrompt(req, res, next);

      expect(responseCode).toBe(401);
      expect(responseBody.error).toBeDefined();
    });

    it('retrieves prompts belonging to user or defaults when no custom prompts exist', async () => {
      const req = {
        user: { id: testUserId, workspaceId: testWorkspaceId },
        query: {},
      } as any;

      let responseCode = 200;
      let responseBody: any;
      const res = {
        status: (code: number) => {
          responseCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      } as any;
      const next = vi.fn();

      vi.spyOn(db.aIMemory, 'findMany').mockResolvedValue([]);

      await controller.getPrompts(req, res, next);

      expect(responseCode).toBe(200);
      expect(responseBody.success).toBe(true);
      expect(Array.isArray(responseBody.data)).toBe(true);
      expect(responseBody.data.length).toBeGreaterThan(0);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Route Authentication Guards', () => {
    it('knowledge routes define /retrieve endpoint', () => {
      const retrieveLayer = knowledgeRoutes.stack.find(
        (layer: any) => layer.route?.path === '/retrieve' && layer.route?.methods?.post
      );
      expect(retrieveLayer).toBeDefined();
    });

    it('ai routes define /prompts endpoints', () => {
      const getPromptsLayer = aiRoutes.stack.find(
        (layer: any) => layer.route?.path === '/prompts' && layer.route?.methods?.get
      );
      const postPromptsLayer = aiRoutes.stack.find(
        (layer: any) => layer.route?.path === '/prompts' && layer.route?.methods?.post
      );
      expect(getPromptsLayer).toBeDefined();
      expect(postPromptsLayer).toBeDefined();
    });
  });
});
