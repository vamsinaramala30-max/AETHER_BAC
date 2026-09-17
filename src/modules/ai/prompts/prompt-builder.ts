/**
 * AETHER AI — Prompt Builder
 * Assembles complete prompts from modular components.
 * Token-budget-aware. Handles context window limits.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { PromptBuildFailedError } from '../ai-errors.js';
import type { AIContext, BuiltPrompt, PromptMessage, MessageRole } from '../ai-types.js';
import { buildSystemPrompt } from './system-prompts.js';
import { buildRAGContextBlock, RAG_CITATION_INSTRUCTION } from './rag-prompts.js';
import { defaultTokenizer } from '../llm/tokenizer.js';

// ─── Prompt Build Options ─────────────────────────────────────────────────────

export interface PromptBuildOptions {
  readonly userMessage: string;
  readonly context: AIContext;
  readonly includeRAG: boolean;
  readonly includeMemory: boolean;
  readonly customSystemInstructions?: string;
}

// ─── IPromptBuilder Interface ─────────────────────────────────────────────────

export interface IPromptBuilder {
  build(options: PromptBuildOptions): Result<BuiltPrompt>;
}

// ─── Prompt Builder Implementation ───────────────────────────────────────────

export class PromptBuilder implements IPromptBuilder {
  public build(options: PromptBuildOptions): Result<BuiltPrompt> {
    try {
      const { userMessage, context, includeRAG, includeMemory } = options;
      const { tokenBudget } = context;

      if (!userMessage || userMessage.trim().length === 0) {
        return fail(new PromptBuildFailedError('userMessage is required'));
      }

      // ─── System Prompt ───────────────────────────────────────────────

      const hasRAGContext =
        includeRAG && context.ragContext !== undefined && context.ragContext.documents.length > 0;

      const systemText = buildSystemPrompt({
        includeRAGInstruction: hasRAGContext,
        includeMemoryInstruction: includeMemory && (context.longTermMemory?.length ?? 0) > 0,
        includeNoKnowledgeInstruction: includeRAG && !hasRAGContext,
        customInstructions: options.customSystemInstructions ?? context.systemInstructions,
      });

      let systemContent = systemText;

      // ─── Long-Term Memory Context ────────────────────────────────────

      if (includeMemory && context.longTermMemory && context.longTermMemory.length > 0) {
        const memoryBlock = this.buildMemoryBlock(context.longTermMemory, tokenBudget.context);
        if (memoryBlock) {
          systemContent += `\n\nRelevant memories from previous interactions:\n${memoryBlock}`;
        }
      }

      // ─── RAG Context ─────────────────────────────────────────────────

      if (hasRAGContext && context.ragContext) {
        const ragBlock = buildRAGContextBlock(context.ragContext.documents);
        systemContent += `\n\n${ragBlock}`;
        systemContent += RAG_CITATION_INSTRUCTION;
      }

      // ─── Conversation History ────────────────────────────────────────

      const messages: PromptMessage[] = [];

      if (context.conversationHistory && context.conversationHistory.length > 0) {
        const historyBudget = tokenBudget.history;
        const trimmedHistory = defaultTokenizer.trimMessages(
          [...context.conversationHistory],
          historyBudget,
        );

        for (const msg of trimmedHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // ─── Working Memory Context ──────────────────────────────────────

      if (context.workingMemory && context.workingMemory.items.length > 0) {
        const workingMemBlock = context.workingMemory.items
          .map((item) => `${item.key}: ${item.value}`)
          .join('\n');
        const systemAppend = `\n\nCurrent session context:\n${workingMemBlock}`;
        systemContent += systemAppend;
      }

      // ─── User Message ────────────────────────────────────────────────

      messages.push({ role: 'user', content: userMessage });

      // ─── Token Estimation ────────────────────────────────────────────

      const systemTokens = defaultTokenizer.count(systemContent).tokenCount;
      const messageTokens = defaultTokenizer.countMessages(messages).tokenCount;
      const estimatedTokens = systemTokens + messageTokens;

      if (estimatedTokens > tokenBudget.total) {
        return fail(
          new PromptBuildFailedError(
            `Prompt exceeds token budget: ${estimatedTokens} tokens > ${tokenBudget.total} limit`,
          ),
        );
      }

      return ok({
        system: systemContent,
        messages,
        estimatedTokens,
      });
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new PromptBuildFailedError(error instanceof Error ? error.message : String(error), cause),
      );
    }
  }

  private buildMemoryBlock(
    memories: readonly { content: string; type: string; importance: number }[],
    maxTokens: number,
  ): string {
    const lines: string[] = [];
    let usedTokens = 0;

    // Sort by importance desc
    const sorted = [...memories].sort((a, b) => b.importance - a.importance);

    for (const mem of sorted) {
      const line = `[${mem.type}] ${mem.content}`;
      const tokens = defaultTokenizer.count(line).tokenCount;
      if (usedTokens + tokens > maxTokens) break;
      lines.push(line);
      usedTokens += tokens;
    }

    return lines.join('\n');
  }
}
