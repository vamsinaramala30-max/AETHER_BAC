import { describe, it, expect, beforeEach } from 'vitest';
import { ContextEngine } from '../../modules/ai/core/context-engine.js';
import { MemoryEngine } from '../../modules/ai/memory/memory-engine.js';
import { buildDefaultAIConfig } from '../../modules/ai/ai-config.js';
import type { IRAGEngine } from '../../modules/ai/rag/rag-engine.js';
import type { AIRequest, Intent } from '../../modules/ai/ai-types.js';

describe('ContextEngine — Hardened Context Intelligence', () => {
  const config = buildDefaultAIConfig();
  let memoryEngine: MemoryEngine;
  let mockRAGEngine: IRAGEngine;
  let contextEngine: ContextEngine;

  beforeEach(() => {
    memoryEngine = new MemoryEngine(config);
    mockRAGEngine = {
      isEmbeddingAvailable: async () => true,
      query: async (opts: { text: string; [key: string]: unknown }) => ({
        ok: true,
        value: {
          documents: [
            {
              documentId: 'doc_1',
              chunkId: 'chunk_1',
              content: 'Aether OS is an AI-first workspace.',
              score: 0.92,
              metadata: { title: 'Architecture Overview' },
              citation: {
                id: 'cite_1',
                documentId: 'doc_1',
                chunkId: 'chunk_1',
                title: 'Architecture Overview',
                source: 'docs/arch.md',
                excerpt: 'Aether OS is an AI-first workspace.',
                relevanceScore: 0.92,
              },
            },
          ],
          totalRetrieved: 1,
          searchQuery: opts.text,
        },
      }),
      indexDocument: async () => ({ ok: true, value: undefined }),
      deleteDocument: async () => ({ ok: true, value: undefined }),
      getStatus: async () => ({
        enabled: true,
        documentCount: 1,
        indexedCount: 1,
        pendingCount: 0,
        errorCount: 0,
      }),
    } as unknown as IRAGEngine;

    contextEngine = new ContextEngine(memoryEngine, mockRAGEngine, config);
  });

  it('should assemble multi-source context with traceable metadata', async () => {
    // Populate conversation history
    memoryEngine.addConversationMessage('user_1', 'sess_1', 'conv_1', 'user', 'Hello');
    memoryEngine.addConversationMessage('user_1', 'sess_1', 'conv_1', 'assistant', 'Hello! How can I help?');

    // Populate working memory
    memoryEngine.setWorkingMemory('user_1', 'sess_1', 'active_tab', 'dashboard');

    const request: AIRequest = {
      requestId: 'req_ctx_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Show me my tasks for today',
      timestamp: Date.now(),
    };

    const intent: Intent = {
      type: 'PROJECT_WORKSPACE_TASK',
      primaryIntent: 'TASK_ACTION',
      confidence: 0.9,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: true,
      requiresAgent: false,
      requiredContext: {
        conversation: true,
        memory: false,
        rag: false,
        project: true,
        workspace: true,
        tools: true,
        system: true,
      },
    };

    const res = await contextEngine.buildContext(request, intent);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ctx = res.value;
      expect(ctx.userId).toBe('user_1');
      expect(ctx.sessionId).toBe('sess_1');
      expect(ctx.conversationId).toBe('conv_1');
      expect(ctx.conversationHistory?.length).toBe(2);
      expect(ctx.workingMemory?.items.length).toBe(1);
      expect(ctx.workspaceContext).toBeDefined();

      // Check metadata traceability
      expect(ctx.sourcesMetadata).toBeDefined();
      expect(ctx.sourcesMetadata?.length).toBeGreaterThanOrEqual(2);

      const requestMeta = ctx.sourcesMetadata?.find((m) => m.source === 'request');
      expect(requestMeta).toBeDefined();
      expect(requestMeta?.priority).toBe(1);

      const historyMeta = ctx.sourcesMetadata?.find((m) => m.source === 'conversation_history');
      expect(historyMeta).toBeDefined();
      expect(historyMeta?.priority).toBe(2);
    }
  });

  it('should enforce strict user isolation between different users', async () => {
    // User 1 conversation
    memoryEngine.addConversationMessage('user_1', 'sess_1', 'conv_1', 'user', 'Confidential User 1 Data');

    // User 2 request
    const requestUser2: AIRequest = {
      requestId: 'req_user2',
      userId: 'user_2',
      sessionId: 'sess_2',
      conversationId: 'conv_2',
      message: 'What was my previous question?',
      timestamp: Date.now(),
    };

    const intent: Intent = {
      type: 'GENERAL_REASONING',
      confidence: 0.8,
      requiresRAG: false,
      requiresMemory: true,
      requiresTool: false,
      requiresAgent: false,
    };

    const res = await contextEngine.buildContext(requestUser2, intent);
    expect(res.ok).toBe(true);
    if (res.ok) {
      // User 2 context should NOT have User 1 history
      expect(res.value.conversationHistory?.length).toBe(0);
      expect(res.value.userId).toBe('user_2');
    }
  });

  it('should enforce session isolation for working memory', async () => {
    // Set working memory in session A
    memoryEngine.setWorkingMemory('user_1', 'session_A', 'draft_note', 'Private Draft A');

    // Query in session B
    const requestSessionB: AIRequest = {
      requestId: 'req_sessB',
      userId: 'user_1',
      sessionId: 'session_B',
      conversationId: 'conv_B',
      message: 'Continue my draft',
      timestamp: Date.now(),
    };

    const intent: Intent = {
      type: 'GENERAL_REASONING',
      confidence: 0.8,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };

    const res = await contextEngine.buildContext(requestSessionB, intent);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.workingMemory?.items.length).toBe(0);
    }
  });

  it('should include RAG context when required by intent and filter by score threshold', async () => {
    const request: AIRequest = {
      requestId: 'req_rag_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'According to document, what is Aether OS?',
      timestamp: Date.now(),
    };

    const intent: Intent = {
      type: 'KNOWLEDGE_QUESTION',
      primaryIntent: 'RESEARCH_LOOKUP',
      confidence: 0.9,
      requiresRAG: true,
      requiresMemory: false,
      requiresTool: true,
      requiresAgent: false,
      requiredContext: {
        conversation: true,
        memory: false,
        rag: true,
        project: false,
        workspace: false,
        tools: true,
        system: false,
      },
    };

    const res = await contextEngine.buildContext(request, intent);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.ragContext).toBeDefined();
      expect(res.value.ragContext?.documents.length).toBe(1);
      expect(res.value.ragContext?.documents[0]?.content).toContain('Aether OS');

      const ragMeta = res.value.sourcesMetadata?.find((m) => m.source === 'rag_knowledge');
      expect(ragMeta).toBeDefined();
      expect(ragMeta?.priority).toBe(4);
    }
  });

  it('should compute and respect token budgets properly', async () => {
    const request: AIRequest = {
      requestId: 'req_budget',
      userId: 'user_1',
      sessionId: 'sess_1',
      conversationId: 'conv_1',
      message: 'Test budget calculation',
      timestamp: Date.now(),
    };

    const intent: Intent = {
      type: 'GENERAL_REASONING',
      confidence: 0.7,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };

    const res = await contextEngine.buildContext(request, intent);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const { tokenBudget } = res.value;
      expect(tokenBudget.total).toBeGreaterThan(0);
      expect(tokenBudget.remaining).toBeGreaterThan(0);
      expect(tokenBudget.remaining).toBeLessThanOrEqual(tokenBudget.total);
    }
  });
});
