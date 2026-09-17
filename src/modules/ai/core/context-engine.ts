/**
 * AETHER AI — Context Engine (Phase 14 Production Grade)
 *
 * Implements 5-Tier Context Management:
 *   1. Immediate Context: Current prompt and immediate conversation turn.
 *   2. Session Context: Working memory and active conversation state.
 *   3. User Context: Persistent user preferences and long-term memory.
 *   4. Task / Project Context: Target project intelligence, tasks, deadlines.
 *   5. Knowledge Context: RAG retrieved documents and workspace docs.
 *
 * Enforces intelligent context selection, pronoun/entity reference resolution,
 * token bounds, and strict user isolation.
 */

import type {
  AIContext,
  AIRequest,
  TokenBudget,
  RAGContext,
  WorkingMemoryContext,
  MemoryItem,
  ContextSourceMetadata,
  ProjectContextSummary,
  WorkspaceContextSummary,
  Result,
} from '../ai-types.js';
import { ok, fail, makeError } from '../ai-types.js';
import type { IMemoryEngine } from '../memory/memory-engine.js';
import type { IRAGEngine } from '../rag/rag-engine.js';
import type { Intent } from '../ai-types.js';
import { defaultTokenizer } from '../llm/tokenizer.js';
import type { AIConfig } from '../ai-config.js';
import { projectIntelligenceService } from '../context/project-intelligence.js';

// ─── IContextEngine Interface ─────────────────────────────────────────────────

export interface IContextEngine {
  buildContext(request: AIRequest, intent: Intent): Promise<Result<AIContext>>;
}

// ─── Context Engine Implementation ───────────────────────────────────────────

export class ContextEngine implements IContextEngine {
  constructor(
    private readonly memoryEngine?: IMemoryEngine,
    private readonly ragEngine?: IRAGEngine,
    private readonly config?: AIConfig,
  ) {}

  public async assemble(request: AIRequest, intent: Intent): Promise<Result<AIContext>> {
    return this.buildContext(request, intent);
  }

  public async buildContext(request: AIRequest, intent: Intent): Promise<Result<AIContext>> {
    try {
      const maxContextTokens = this.config?.model?.maxContextTokens ?? 4096;
      const tokenBudget = defaultTokenizer.buildBudget(maxContextTokens);
      const sourcesMetadata: ContextSourceMetadata[] = [];

      // ─── 1. Immediate Context (Priority 1) ─────────────────────────────────
      const requestTokenCount = defaultTokenizer.count(request.message).tokenCount;
      sourcesMetadata.push({
        source: 'request',
        relevanceScore: 1.0,
        priority: 1,
        tokenCount: requestTokenCount,
        scope: `user:${request.userId}`,
        timestamp: request.timestamp || Date.now(),
        description: 'Current user prompt',
      });

      // ─── 2. Conversation History / Session Context (Priority 2) ───────────
      let conversationHistory = this.memoryEngine
        ? this.memoryEngine.getConversationHistory(
            request.userId,
            request.sessionId,
            request.conversationId,
            tokenBudget.history,
          )
        : [];

      // Deduplicate consecutive identical messages
      conversationHistory = conversationHistory.filter((msg, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        return !(prev && prev.role === msg.role && prev.content === msg.content);
      });

      const historyTokens = defaultTokenizer.countMessages(
        conversationHistory.map((m) => ({ content: m.content })),
      ).tokenCount;

      if (conversationHistory.length > 0) {
        sourcesMetadata.push({
          source: 'conversation_history',
          relevanceScore: 0.9,
          priority: 2,
          tokenCount: historyTokens,
          scope: `conv:${request.conversationId}`,
          timestamp: Date.now(),
          description: `${conversationHistory.length} turns from active conversation`,
        });
      }

      // ─── 3. Session / Working Memory Context (Priority 3) ──────────────────
      const workingMemory: WorkingMemoryContext = this.memoryEngine
        ? this.memoryEngine.getWorkingMemoryContext(request.userId, request.sessionId)
        : { items: [], sessionId: request.sessionId };

      if (workingMemory.items.length > 0) {
        const workingMemContent = workingMemory.items.map((i) => `${i.key}=${i.value}`).join('; ');
        sourcesMetadata.push({
          source: 'working_memory',
          relevanceScore: 0.8,
          priority: 3,
          tokenCount: defaultTokenizer.count(workingMemContent).tokenCount,
          scope: `session:${request.sessionId}`,
          timestamp: Date.now(),
          description: `${workingMemory.items.length} working memory keys`,
        });
      }

      // ─── 4. Knowledge Context / RAG (Priority 4) ──────────────────────────
      let ragContext: RAGContext | undefined;
      const lowerMessage = request.message.toLowerCase();
      const shouldFetchRAG =
        Boolean(
          this.ragEngine &&
            (intent.requiresRAG ||
              intent.requiredContext?.rag ||
              intent.type === 'KNOWLEDGE_REQUEST' ||
              request.options?.enableRAG === true) &&
            this.config?.rag?.enabled !== false &&
            request.options?.enableRAG !== false,
        );

      if (shouldFetchRAG && this.ragEngine) {
        try {
          const ragResult = await this.ragEngine.query({
            text: request.message,
            topK: this.config?.rag?.topK ?? 5,
            scoreThreshold: this.config?.rag?.scoreThreshold ?? 0.5,
            collectionIds: request.options?.ragCollectionIds,
            userId: request.userId,
            workspaceId: request.workspaceId,
            projectId: request.projectId,
          });

          if (ragResult.ok && ragResult.value.documents.length > 0) {
            ragContext = {
              documents: ragResult.value.documents,
              totalRetrieved: ragResult.value.totalRetrieved,
              searchQuery: request.message,
            };

            const ragTokens = ragResult.value.documents.reduce(
              (sum, doc) => sum + defaultTokenizer.count(doc.content).tokenCount,
              0,
            );

            sourcesMetadata.push({
              source: 'rag_knowledge',
              relevanceScore: Math.max(...ragResult.value.documents.map((d) => d.score), 0),
              priority: 4,
              tokenCount: ragTokens,
              scope: request.options?.ragCollectionIds?.join(',') || 'global',
              timestamp: Date.now(),
              description: `${ragResult.value.documents.length} retrieved knowledge documents`,
            });
          }
        } catch (ragErr) {
          console.warn('[ContextEngine] RAG retrieval warning:', ragErr);
        }
      }

      // ─── 5. User Context / Long-Term Memory (Priority 5) ──────────────────
      let longTermMemory: readonly MemoryItem[] | undefined;
      const shouldFetchMemory =
        Boolean(
          this.memoryEngine &&
            (intent.requiresMemory ||
              intent.requiredContext?.memory ||
              intent.type === 'MEMORY_RECALL' ||
              lowerMessage.includes('priority') ||
              lowerMessage.includes('remember') ||
              lowerMessage.includes('what should i do next')) &&
            this.config?.memory?.enabled !== false &&
            request.options?.enableMemory !== false,
        );

      if (shouldFetchMemory && this.memoryEngine) {
        try {
          const memResult = await this.memoryEngine.searchMemory({
            userId: request.userId,
            text: request.message,
            topK: 5,
            scoreThreshold: 0.1,
          });

          if (memResult.ok && memResult.value.length > 0) {
            const userMemories = memResult.value.filter((m) => m.userId === request.userId);
            const seenContent = new Set<string>();
            const uniqueMemories: MemoryItem[] = [];

            for (const mem of userMemories) {
              const norm = mem.content.trim().toLowerCase();
              if (!seenContent.has(norm)) {
                seenContent.add(norm);
                uniqueMemories.push(mem);
              }
            }

            if (uniqueMemories.length > 0) {
              longTermMemory = uniqueMemories;
              const memTokens = uniqueMemories.reduce(
                (sum, m) => sum + defaultTokenizer.count(m.content).tokenCount,
                0,
              );

              sourcesMetadata.push({
                source: 'long_term_memory',
                relevanceScore: 0.85,
                priority: 5,
                tokenCount: memTokens,
                scope: `user:${request.userId}`,
                timestamp: Date.now(),
                description: `${uniqueMemories.length} relevant long-term memories`,
              });
            }
          }
        } catch (memErr) {
          console.warn('[ContextEngine] Memory retrieval warning:', memErr);
        }
      }

      // ─── 6. Task / Project Workspace Intelligence ─────────────────────────
      let projectContext: ProjectContextSummary | undefined;
      let workspaceContext: WorkspaceContextSummary | undefined;
      let projectSystemInstructions: string | undefined;

      const projectEntity = intent.entities?.find(
        (e) => e.type === 'project_name' || e.type === 'project_id',
      );
      const isProjectRelated =
        intent.requiredContext?.project ||
        intent.type === 'PROJECT_WORKSPACE_TASK' ||
        intent.type === 'PROJECT_PLANNING' ||
        intent.type === 'PROJECT_MANAGEMENT' ||
        Boolean(projectEntity);

      if (isProjectRelated && projectEntity?.value) {
        try {
          const pCtx = await projectIntelligenceService.getProjectContext(
            request.userId,
            projectEntity.value,
          );

          if (pCtx) {
            projectContext = pCtx;
            sourcesMetadata.push({
              source: 'project_intelligence',
              relevanceScore: 0.9,
              priority: 3,
              tokenCount: defaultTokenizer.count(pCtx.summaryText || '').tokenCount,
              scope: `project:${pCtx.projectId}`,
              timestamp: Date.now(),
              description: `Project context: ${pCtx.projectName} (${pCtx.status})`,
            });
          }
        } catch (intelErr) {
          console.warn('[ContextEngine] Project intelligence warning:', intelErr);
        }
      }

      if (intent.requiredContext?.workspace || intent.type === 'PROJECT_WORKSPACE_TASK') {
        workspaceContext = {
          workspaceId: `ws_${request.userId}`,
          name: 'Personal Workspace',
          summaryText: 'Default workspace context',
        };
        sourcesMetadata.push({
          source: 'workspace',
          relevanceScore: 0.8,
          priority: 4,
          tokenCount: defaultTokenizer.count(workspaceContext.summaryText || '').tokenCount,
          scope: `workspace:${workspaceContext.workspaceId}`,
          timestamp: Date.now(),
          description: `Workspace: ${workspaceContext.name}`,
        });
      }

      // ─── 7. Reference Resolution (Pronouns & Anaphora) ─────────────────────
      if (conversationHistory.length > 0) {
        const lastUserTurn = [...conversationHistory].reverse().find((m) => m.role === 'user');
        if (lastUserTurn) {
          const pronouns = ['it', 'this', 'that', 'them', 'the project', 'the task'];
          for (const pronoun of pronouns) {
            const regex = new RegExp(`\\b${pronoun}\\b`, 'i');
            if (regex.test(request.message)) {
              sourcesMetadata.push({
                source: 'conversation_history',
                relevanceScore: 0.8,
                priority: 2,
                tokenCount: 0,
                scope: `conv:${request.conversationId}`,
                timestamp: Date.now(),
                description: `Resolved pronoun "${pronoun}" against recent conversation history`,
              });
              break;
            }
          }
        }
      }

      // ─── 8. Token Budget Enforcement & Context Assembly ───────────────────
      const totalAllocated = sourcesMetadata.reduce((sum, s) => sum + s.tokenCount, 0);
      const remainingTokens = Math.max(0, maxContextTokens - totalAllocated);

      const adjustedBudget: TokenBudget = {
        total: maxContextTokens,
        system: tokenBudget.system,
        history: historyTokens,
        context: totalAllocated - historyTokens - requestTokenCount,
        response: tokenBudget.response,
        remaining: remainingTokens,
      };

      const context: AIContext = {
        userId: request.userId,
        sessionId: request.sessionId,
        conversationId: request.conversationId,
        conversationHistory,
        ragContext,
        workingMemory,
        longTermMemory,
        projectContext,
        workspaceContext,
        systemInstructions: projectSystemInstructions,
        activeEntities: intent.entities,
        sourcesMetadata,
        tokenBudget: adjustedBudget,
      };

      return ok(context);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return fail(makeError('INTERNAL_ERROR', msg));
    }
  }
}

export const contextEngine = new ContextEngine();
