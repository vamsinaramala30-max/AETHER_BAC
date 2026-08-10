/**
 * AETHER AI — AI Orchestrator
 * Coordinates the full AI pipeline:
 *   Request → Intent → Context → Prompt → LLM → Reasoning → Safety → Response → Stream
 *
 * This is the central coordinator — all sub-engines flow through here.
 */

import type { AIRequest, AIResponse, StreamingChunk, Intent } from '../ai-types.js';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { InvalidRequestError, SafetyCheckFailedError, InternalError, toAetherAIError } from '../ai-errors.js';
import type { ILLMEngine } from '../llm/llm-engine.js';
import type { IIntentEngine } from './intent-engine.js';
import type { IContextEngine } from './context-engine.js';
import type { IReasoningEngine } from './reasoning-engine.js';
import type { ISafetyEngine } from './safety-engine.js';
import type { IResponseEngine } from './response-engine.js';
import type { IStreamingEngine, StreamSubscriber } from './streaming-engine.js';
import type { IPromptEngine } from '../prompts/prompt-engine.js';
import type { IMemoryEngine } from '../memory/memory-engine.js';
import type { AIConfig } from '../ai-config.js';

// ─── IAIOrchestrator Interface ────────────────────────────────────────────────

export interface IAIOrchestrator {
  process(request: AIRequest): Promise<Result<AIResponse>>;
  processStream(
    request: AIRequest,
    subscriber: StreamSubscriber,
  ): Promise<Result<void>>;
}

// ─── AI Orchestrator Implementation ──────────────────────────────────────────

export class AIOrchestrator implements IAIOrchestrator {
  constructor(
    private readonly llmEngine: ILLMEngine,
    private readonly intentEngine: IIntentEngine,
    private readonly contextEngine: IContextEngine,
    private readonly promptEngine: IPromptEngine,
    private readonly reasoningEngine: IReasoningEngine,
    private readonly safetyEngine: ISafetyEngine,
    private readonly responseEngine: IResponseEngine,
    private readonly streamingEngine: IStreamingEngine,
    private readonly memoryEngine: IMemoryEngine,
    private readonly config: AIConfig,
  ) {}

  public async process(request: AIRequest): Promise<Result<AIResponse>> {
    const startTime = Date.now();

    // ─── Validate Request ──────────────────────────────────────────────────

    const validation = this.validateRequest(request);
    if (!validation.ok) {
      return fail(validation.error);
    }

    // ─── Safety: Input Check ───────────────────────────────────────────────

    const safetyCheck = this.safetyEngine.checkInput(request.message, request.userId);
    if (!safetyCheck.safe || safetyCheck.blocked) {
      const intent = this.classifyFallback();
      return ok(
        this.responseEngine.buildError(request, intent, 'SAFETY_CHECK_FAILED', startTime),
      );
    }

    // ─── Intent Classification ─────────────────────────────────────────────

    const intentResult = this.intentEngine.classify(request.message);
    const intent: Intent = intentResult.ok
      ? intentResult.value
      : this.classifyFallback();

    // ─── Start Reasoning Trace ─────────────────────────────────────────────

    this.reasoningEngine.startReasoning(request.requestId);
    this.reasoningEngine.updateStatus(request.requestId, 'thinking');

    // ─── Build Context ─────────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(request.requestId, 'retrieving');

    const contextResult = await this.contextEngine.buildContext(request, intent);
    if (!contextResult.ok) {
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return fail(contextResult.error);
    }
    const context = contextResult.value;

    // ─── Build Prompt ──────────────────────────────────────────────────────

    const promptResult = this.promptEngine.build(request.message, context, {
      includeRAG: intent.requiresRAG,
      includeMemory: intent.requiresMemory,
    });
    if (!promptResult.ok) {
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return fail(promptResult.error);
    }
    const prompt = promptResult.value;

    // ─── Generate ──────────────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(request.requestId, 'generating');

    const messages = [
      { role: 'system' as const, content: prompt.system },
      ...prompt.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const genResult = await this.llmEngine.generate(request.requestId, {
      modelId: request.options?.modelId ?? this.llmEngine.getDefaultModelId(),
      messages,
      temperature: request.options?.temperature,
      maxTokens: request.options?.maxTokens,
      timeoutMs: request.options?.timeout,
      signal: request.signal,
    });

    if (!genResult.ok) {
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return ok(
        this.responseEngine.buildError(request, intent, genResult.error.code, startTime),
      );
    }

    // ─── Safety: Output Check ──────────────────────────────────────────────

    const outputSafety = this.safetyEngine.checkOutput(genResult.value.content);

    // ─── Store Conversation Message ────────────────────────────────────────

    this.memoryEngine.addConversationMessage(
      request.userId,
      request.sessionId,
      request.conversationId,
      'user',
      request.message,
    );
    this.memoryEngine.addConversationMessage(
      request.userId,
      request.sessionId,
      request.conversationId,
      'assistant',
      genResult.value.content,
    );

    // ─── Finalize Reasoning ────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(request.requestId, 'completed');
    this.reasoningEngine.endReasoning(request.requestId);

    // ─── Build Response ────────────────────────────────────────────────────

    const citations = context.ragContext?.documents.map((d) => d.citation);
    const response = this.responseEngine.buildSuccess(
      request,
      genResult.value,
      intent,
      citations,
      undefined,
      'completed',
      startTime,
    );

    return ok(response);
  }

  public async processStream(
    request: AIRequest,
    subscriber: StreamSubscriber,
  ): Promise<Result<void>> {
    const startTime = Date.now();

    const validation = this.validateRequest(request);
    if (!validation.ok) return fail(validation.error);

    const safetyCheck = this.safetyEngine.checkInput(request.message, request.userId);
    if (!safetyCheck.safe || safetyCheck.blocked) {
      return fail(new SafetyCheckFailedError(safetyCheck.reasons?.join(', ') ?? 'blocked'));
    }

    const intentResult = this.intentEngine.classify(request.message);
    const intent: Intent = intentResult.ok ? intentResult.value : this.classifyFallback();

    this.reasoningEngine.startReasoning(request.requestId);
    this.reasoningEngine.updateStatus(request.requestId, 'retrieving');

    const contextResult = await this.contextEngine.buildContext(request, intent);
    if (!contextResult.ok) {
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return fail(contextResult.error);
    }

    const promptResult = this.promptEngine.build(request.message, contextResult.value, {
      includeRAG: intent.requiresRAG,
      includeMemory: intent.requiresMemory,
    });
    if (!promptResult.ok) {
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return fail(promptResult.error);
    }

    const prompt = promptResult.value;
    const messages = [
      { role: 'system' as const, content: prompt.system },
      ...prompt.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    this.reasoningEngine.updateStatus(request.requestId, 'generating');

    const handle = this.streamingEngine.createStream(request.requestId, subscriber);
    let accumulatedContent = '';

    const streamResult = await this.llmEngine.generateStream(
      request.requestId,
      {
        modelId: request.options?.modelId ?? this.llmEngine.getDefaultModelId(),
        messages,
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
        timeoutMs: request.options?.timeout,
        signal: request.signal,
      },
      (chunk) => {
        if (handle.isCancelled) return;
        accumulatedContent += chunk.delta;
        this.streamingEngine.onLLMChunk(handle, chunk);
      },
    );

    if (!streamResult.ok) {
      this.streamingEngine.failStream(handle, streamResult.error.message);
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return fail(streamResult.error);
    }

    // Store in conversation memory
    this.memoryEngine.addConversationMessage(
      request.userId,
      request.sessionId,
      request.conversationId,
      'user',
      request.message,
    );
    if (accumulatedContent) {
      this.memoryEngine.addConversationMessage(
        request.userId,
        request.sessionId,
        request.conversationId,
        'assistant',
        accumulatedContent,
      );
    }

    this.streamingEngine.completeStream(handle);
    this.reasoningEngine.updateStatus(request.requestId, 'completed');
    this.reasoningEngine.endReasoning(request.requestId);

    return ok(undefined);
  }

  private validateRequest(request: AIRequest): Result<void> {
    if (!request.userId || request.userId.trim().length === 0) {
      return fail(new InvalidRequestError('userId is required'));
    }
    if (!request.sessionId || request.sessionId.trim().length === 0) {
      return fail(new InvalidRequestError('sessionId is required'));
    }
    if (!request.conversationId || request.conversationId.trim().length === 0) {
      return fail(new InvalidRequestError('conversationId is required'));
    }
    if (!request.message || request.message.trim().length === 0) {
      return fail(new InvalidRequestError('message is required'));
    }
    return ok(undefined);
  }

  private classifyFallback(): Intent {
    return {
      type: 'NORMAL_RESPONSE',
      confidence: 0.5,
      requiresRAG: false,
      requiresMemory: false,
      requiresTool: false,
      requiresAgent: false,
    };
  }
}
