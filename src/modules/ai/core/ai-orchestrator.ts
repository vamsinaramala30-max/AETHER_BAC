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
import { ProviderManager } from '../llm/provider-manager.js';
import { buildAetherSystemPrompt } from '../prompts/aether-system-context.js';
import type { IIntentEngine } from './intent-engine.js';
import type { IContextEngine } from './context-engine.js';
import type { IReasoningEngine } from './reasoning-engine.js';
import type { ISafetyEngine } from './safety-engine.js';
import type { IResponseEngine } from './response-engine.js';
import type { IStreamingEngine, StreamSubscriber } from './streaming-engine.js';
import type { IPromptEngine } from '../prompts/prompt-engine.js';
import type { IMemoryEngine } from '../memory/memory-engine.js';
import type { AIConfig } from '../ai-config.js';
import type { IToolExecutor } from '../tools/tool-executor.js';
import { toolExecutor } from '../tools/tool-executor.js';
import type { IConfidenceEngine } from './confidence-engine.js';
import { confidenceEngine } from './confidence-engine.js';
import type { IResponseValidator } from './response-validator.js';
import { responseValidator } from './response-validator.js';
import type { IConfirmationManager } from './confirmation-manager.js';
import { confirmationManager } from './confirmation-manager.js';

// ─── IAIOrchestrator Interface ────────────────────────────────────────────────

export interface IAIOrchestrator {
  process(request: AIRequest): Promise<Result<AIResponse>>;
  processStream(
    request: AIRequest,
    subscriber: StreamSubscriber,
  ): Promise<Result<void>>;
  getProviderManager(): ProviderManager;
}

// ─── AI Orchestrator Implementation ──────────────────────────────────────────

export class AIOrchestrator implements IAIOrchestrator {
  private readonly providerManager: ProviderManager;

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
    private readonly toolExec: IToolExecutor = toolExecutor,
    private readonly confEngine: IConfidenceEngine = confidenceEngine,
    private readonly respValidator: IResponseValidator = responseValidator,
    private readonly confManager: IConfirmationManager = confirmationManager,
  ) {
    this.providerManager = new ProviderManager(this.config);
  }

  public getProviderManager(): ProviderManager {
    return this.providerManager;
  }

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

    // ─── Tool Check & Confirmation ──────────────────────────────────────────

    let toolExecuted = false;
    let toolSuccess = false;
    let toolResultContext = '';

    if (intent.requiresTool) {
      const toolName = intent.type === 'AUTOMATION_REQUEST' ? 'list_automations' : 'list_workspace';
      const args = {};

      if (this.confManager.requiresConfirmation(toolName, args)) {
        const confReq = this.confManager.createConfirmationRequest(toolName, args);
        this.reasoningEngine.updateStatus(request.requestId, 'completed');
        this.reasoningEngine.endReasoning(request.requestId);

        const confResponse: AIResponse = {
          requestId: request.requestId,
          userId: request.userId,
          sessionId: request.sessionId,
          conversationId: request.conversationId,
          message: confReq.description,
          intent,
          status: 'confirmation_required',
          confirmationRequest: confReq,
          latencyMs: Date.now() - startTime,
          timestamp: Date.now(),
        };
        return ok(confResponse);
      }

      toolExecuted = true;
      const tResult = await this.toolExec.execute(toolName, args, {
        auth: { userId: request.userId, sessionId: request.sessionId, roles: ['user'], permissions: ['*'] },
        traceId: request.requestId,
        conversationId: request.conversationId,
        requestId: request.requestId,
      });
      toolSuccess = tResult.success;
      if (tResult.success && tResult.data) {
        toolResultContext = `\n[Tool Execution Result (${toolName})]\n${JSON.stringify(tResult.data, null, 2)}`;
      }
    }

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

    // Inject Aether System Context Prompt & Tool Results
    const systemContent = `${buildAetherSystemPrompt()}\n\n${prompt.system}${toolResultContext}`;

    // ─── Generate ──────────────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(request.requestId, 'generating');

    const messages = [
      { role: 'system' as const, content: systemContent },
      ...prompt.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const providerMode = request.options?.providerMode ?? 'auto';
    const execution = await this.providerManager.generate(
      {
        requestId: request.requestId,
        modelId: request.options?.modelId ?? 'default',
        messages,
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
        timeoutMs: request.options?.timeout,
        signal: request.signal,
        stream: false,
      },
      providerMode,
    );

    if (!execution.result.ok) {
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return ok(
        this.responseEngine.buildError(request, intent, execution.result.error.code, startTime),
      );
    }

    const genResponse = execution.result.value;

    // ─── Safety: Output Check ──────────────────────────────────────────────

    this.safetyEngine.checkOutput(genResponse.content);

    // ─── Response Validation ───────────────────────────────────────────────

    const validationRes = this.respValidator.validate(
      request,
      intent,
      context,
      genResponse.content,
      toolExecuted,
      toolSuccess,
    );
    const finalContent = validationRes.correctedContent ?? genResponse.content;

    // ─── Confidence Assessment ─────────────────────────────────────────────

    const confidenceAssessment = this.confEngine.assess(
      request.message,
      intent,
      context,
      finalContent,
      toolExecuted,
      toolSuccess,
    );

    // ─── Store Conversation Message (Session History Isolation) ──────────────

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
      finalContent,
    );

    // ─── Finalize Reasoning ────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(request.requestId, 'completed');
    this.reasoningEngine.endReasoning(request.requestId);

    // ─── Build Response ────────────────────────────────────────────────────

    const citations = context.ragContext?.documents.map((d) => d.citation);
    const baseResponse = this.responseEngine.buildSuccess(
      request,
      { ...genResponse, content: finalContent },
      intent,
      citations,
      undefined,
      'completed',
      startTime,
    );

    const response: AIResponse = {
      ...baseResponse,
      confidence: confidenceAssessment.level,
      activeProvider: execution.activeProvider,
      usedFallback: execution.usedFallback,
      fallbackReason: execution.fallbackReason,
    };

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
    const systemContent = `${buildAetherSystemPrompt()}\n\n${prompt.system}`;
    const messages = [
      { role: 'system' as const, content: systemContent },
      ...prompt.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    this.reasoningEngine.updateStatus(request.requestId, 'generating');

    const handle = this.streamingEngine.createStream(request.requestId, subscriber);
    let accumulatedContent = '';

    const providerMode = request.options?.providerMode ?? 'auto';
    const execution = await this.providerManager.generateStream(
      {
        requestId: request.requestId,
        modelId: request.options?.modelId ?? 'default',
        messages,
        temperature: request.options?.temperature,
        maxTokens: request.options?.maxTokens,
        timeoutMs: request.options?.timeout,
        signal: request.signal,
        stream: true,
      },
      (chunk) => {
        if (handle.isCancelled) return;
        accumulatedContent += chunk.delta;
        this.streamingEngine.onLLMChunk(handle, chunk);
      },
      providerMode,
    );

    if (!execution.result.ok) {
      this.streamingEngine.failStream(handle, execution.result.error.message);
      this.reasoningEngine.updateStatus(request.requestId, 'failed');
      return fail(execution.result.error);
    }

    // Store in conversation memory (Session Isolation)
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
