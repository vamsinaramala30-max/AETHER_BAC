/**
 * AETHER AI — Context Engine
 * Assembles the complete AI context from memory, RAG, and conversation history.
 * Enforces token budgets. User-scoped.
 */

import type {
  AIContext,
  AIRequest,
  TokenBudget,
  RAGContext,
  WorkingMemoryContext,
  MemoryItem,
} from '../ai-types.js';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { InternalError } from '../ai-errors.js';
import type { IMemoryEngine } from '../memory/memory-engine.js';
import type { IRAGEngine } from '../rag/rag-engine.js';
import type { Intent } from '../ai-types.js';
import { defaultTokenizer } from '../llm/tokenizer.js';
import type { AIConfig } from '../ai-config.js';

// ─── IContextEngine Interface ─────────────────────────────────────────────────

export interface IContextEngine {
  buildContext(
    request: AIRequest,
    intent: Intent,
  ): Promise<Result<AIContext>>;
}

// ─── Context Engine Implementation ───────────────────────────────────────────

export class ContextEngine implements IContextEngine {
  constructor(
    private readonly memoryEngine: IMemoryEngine,
    private readonly ragEngine: IRAGEngine,
    private readonly config: AIConfig,
  ) {}

  public async buildContext(
    request: AIRequest,
    intent: Intent,
  ): Promise<Result<AIContext>> {
    try {
      const maxContextTokens = this.config.model.maxContextTokens;
      const tokenBudget = defaultTokenizer.buildBudget(maxContextTokens);

      // ─── Conversation History ──────────────────────────────────────────────

      const conversationHistory = this.memoryEngine.getConversationHistory(
        request.userId,
        request.sessionId,
        request.conversationId,
        tokenBudget.history,
      );

      // ─── Working Memory ───────────────────────────────────────────────────

      const workingMemory: WorkingMemoryContext = this.memoryEngine.getWorkingMemoryContext(
        request.userId,
        request.sessionId,
      );

      // ─── Long-Term Memory ──────────────────────────────────────────────────

      let longTermMemory: readonly MemoryItem[] | undefined;
      if (
        intent.requiresMemory &&
        this.config.memory.enabled
      ) {
        const memResult = await this.memoryEngine.searchMemory({
          userId: request.userId,
          text: request.message,
          topK: 5,
          scoreThreshold: this.config.memory.longTermMemoryScoreThreshold,
        });
        if (memResult.ok && memResult.value.length > 0) {
          longTermMemory = memResult.value;
        }
      }

      // ─── RAG Context ───────────────────────────────────────────────────────

      let ragContext: RAGContext | undefined;
      if (
        intent.requiresRAG &&
        this.config.rag.enabled &&
        (await this.ragEngine.isEmbeddingAvailable())
      ) {
        const ragResult = await this.ragEngine.query({
          text: request.message,
          topK: this.config.rag.topK,
          scoreThreshold: this.config.rag.scoreThreshold,
          collectionIds: request.options?.ragCollectionIds,
        });

        if (ragResult.ok && ragResult.value.documents.length > 0) {
          ragContext = {
            documents: ragResult.value.documents,
            totalRetrieved: ragResult.value.totalRetrieved,
            searchQuery: request.message,
          };
        }
      }

      // ─── Recalculate Remaining Budget ──────────────────────────────────────

      const conversationTokens = defaultTokenizer.countMessages(
        conversationHistory.map((m) => ({ content: m.content })),
      ).tokenCount;
      const ragTokens = ragContext
        ? ragContext.documents.reduce(
            (sum, doc) => sum + defaultTokenizer.count(doc.content).tokenCount,
            0,
          )
        : 0;
      const allocated = conversationTokens + ragTokens;
      const remaining = Math.max(0, maxContextTokens - allocated);

      const adjustedBudget: TokenBudget = {
        ...tokenBudget,
        remaining,
      };

      const context: AIContext = {
        userId: request.userId,
        sessionId: request.sessionId,
        conversationId: request.conversationId,
        conversationHistory,
        ragContext,
        workingMemory,
        longTermMemory,
        systemInstructions: undefined,
        tokenBudget: adjustedBudget,
      };

      return ok(context);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new InternalError(
          error instanceof Error ? error.message : String(error),
          cause,
        ),
      );
    }
  }
}
