/**
 * AETHER AI — Memory Summarizer
 * Summarizes conversation history into long-term memory.
 * Requires a working LLM engine. No fake summaries produced.
 * If LLM is unavailable, returns an explicit unavailable result.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { MemoryFailedError } from '../ai-errors.js';
import type { ContextMessage, UserId, ConversationId } from '../ai-types.js';
import type { ILLMEngine } from '../llm/llm-engine.js';

// ─── Summarization Result ─────────────────────────────────────────────────────

export interface SummarizationResult {
  readonly summary: string;
  readonly messageCount: number;
  readonly userId: UserId;
  readonly conversationId: ConversationId;
  readonly createdAt: number;
}

// ─── IMemorySummarizer Interface ──────────────────────────────────────────────

export interface IMemorySummarizer {
  summarize(
    userId: UserId,
    conversationId: ConversationId,
    messages: readonly ContextMessage[],
  ): Promise<Result<SummarizationResult>>;
}

// ─── Memory Summarizer Implementation ────────────────────────────────────────

export class MemorySummarizer implements IMemorySummarizer {
  constructor(private readonly llmEngine: ILLMEngine) {}

  public async summarize(
    userId: UserId,
    conversationId: ConversationId,
    messages: readonly ContextMessage[],
  ): Promise<Result<SummarizationResult>> {
    if (!userId || userId.trim().length === 0) {
      return fail(new MemoryFailedError('summarize', 'userId is required'));
    }
    if (messages.length === 0) {
      return fail(new MemoryFailedError('summarize', 'No messages to summarize'));
    }

    const runtimeStatus = await this.llmEngine.getRuntimeStatus();
    if (runtimeStatus.status === 'unavailable' || runtimeStatus.status === 'unconfigured') {
      return fail(
        new MemoryFailedError(
          'summarize',
          'LLM runtime is unavailable. Cannot generate memory summary.',
        ),
      );
    }

    const transcript = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    const summaryPrompt = [
      {
        role: 'system' as const,
        content:
          'You are a memory summarizer. Summarize the following conversation into a concise, ' +
          'factual summary of key information, decisions, and context. ' +
          'Include only information explicitly stated in the conversation. ' +
          'Do not infer or add information not present in the transcript.',
      },
      {
        role: 'user' as const,
        content: `Conversation transcript:\n\n${transcript}\n\nProvide a concise summary:`,
      },
    ];

    const requestId = `summary-${Date.now()}`;
    const modelId = this.llmEngine.getDefaultModelId();

    const result = await this.llmEngine.generate(requestId, {
      modelId,
      messages: summaryPrompt,
      temperature: 0.3,
      maxTokens: 512,
    });

    if (!result.ok) {
      return fail(
        new MemoryFailedError('summarize', `LLM generation failed: ${result.error.message}`),
      );
    }

    return ok({
      summary: result.value.content.trim(),
      messageCount: messages.length,
      userId,
      conversationId,
      createdAt: Date.now(),
    });
  }
}
