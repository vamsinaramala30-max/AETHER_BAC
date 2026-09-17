/**
 * AETHER AI — AI Orchestrator
 * Coordinates the full AI pipeline:
 *   Request → Intent → Context → Prompt → LLM → Reasoning → Safety → Response → Stream
 *
 * This is the central coordinator — all sub-engines flow through here.
 */

import type {
  AIRequest,
  AIResponse,
  StreamingChunk,
  Intent,
  VerificationStatus,
  EvidenceItem,
  ExecutionReliabilityState,
  AgentTask,
  AgentTaskType,
  MemoryType,
  MemoryScope,
  AIContext,
} from '../ai-types.js';
import type { ActionPlan, PlanExecutionResult } from '../planning/planning-types.js';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import {
  InvalidRequestError,
  SafetyCheckFailedError,
  InternalError,
  toAetherAIError,
} from '../ai-errors.js';
import type { ILLMEngine } from '../llm/llm-engine.js';
import { ProviderManager } from '../llm/provider-manager.js';
import { buildAetherSystemPrompt } from '../prompts/aether-system-context.js';
import { buildStrategyInstruction } from '../prompts/reasoning-prompts.js';
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
import { memoryExtractor } from '../memory/memory-extractor.js';
import { memoryClassifier } from '../memory/memory-classifier.js';
import { planningEngine } from '../planning/planning-engine.js';
import { planExecutor } from '../planning/plan-executor.js';
import { responseSynthesizer } from './response-synthesizer.js';
import type { IConversationManager } from '../conversations/conversation-manager.js';
import { conversationManager } from '../conversations/conversation-manager.js';
import type { ICoreOrchestrator } from '../interfaces/core-contracts.js';
import { executionEngine, ExecutionEngine } from '../execution/execution-engine.js';

// ─── IAIOrchestrator Interface ────────────────────────────────────────────────

export interface IAIOrchestrator extends ICoreOrchestrator {
  process(request: AIRequest): Promise<Result<AIResponse>>;
  processStream(request: AIRequest, subscriber: StreamSubscriber): Promise<Result<void>>;
  getProviderManager(): ProviderManager;
  getExecutionEngine?(): ExecutionEngine;
}

// ─── AI Orchestrator Implementation ──────────────────────────────────────────

export class AIOrchestrator implements IAIOrchestrator, ICoreOrchestrator {
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
    private readonly convManager: IConversationManager = conversationManager,
    private readonly executionEng: ExecutionEngine = executionEngine,
  ) {
    this.providerManager = new ProviderManager(this.config);
  }

  public getProviderManager(): ProviderManager {
    return this.providerManager;
  }

  public getExecutionEngine(): ExecutionEngine {
    return this.executionEng;
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
      return ok(this.responseEngine.buildError(request, intent, 'SAFETY_CHECK_FAILED', startTime));
    }

    // ─── Intent Classification ─────────────────────────────────────────────

    this.reasoningEngine.startReasoning(request.requestId);
    this.reasoningEngine.updateStatus(
      request.requestId,
      'thinking',
      'Classifying user intent',
      'request_received',
    );

    const intentResult = this.intentEngine.classify(request.message, { conversationId: request.conversationId });
    const intent: Intent = intentResult.ok ? intentResult.value : this.classifyFallback();
    const taskType: AgentTaskType = this.intentEngine.classifyTaskType
      ? this.intentEngine.classifyTaskType(intent, request.message)
      : 'SIMPLE';

    // Record turn in ConversationManager (Phase 14)
    const turn = this.convManager.recordTurn(
      request.conversationId,
      request.message,
      intent,
      intent.entities,
    );

    const agentTask: AgentTask = {
      id: `task_${request.requestId}`,
      userRequest: request.message,
      intent,
      taskType,
      contextRequirements: intent.requiredContext ?? {
        conversation: true,
        memory: false,
        rag: false,
        project: false,
        workspace: false,
        tools: false,
        system: false,
      },
      memoryRequired: intent.requiresMemory || (intent.requiredContext?.memory ?? false),
      knowledgeRequired: intent.requiresRAG || (intent.requiredContext?.rag ?? false),
      toolsRequired: intent.requiresTool || (intent.requiredContext?.tools ?? false),
      planningRequired: intent.requiresAgent ?? false,
      clarificationRequired: intent.requiresClarification === true,
      status: 'planning',
      createdAt: startTime,
    };

    this.reasoningEngine.updateStatus(
      request.requestId,
      'thinking',
      `Identified intent: ${intent.type} (Task Type: ${taskType})`,
      'intent_identified',
    );

    // ─── Cancellation Pre-Check ────────────────────────────────────────────

    if (request.signal?.aborted) {
      this.reasoningEngine.updateStatus(request.requestId, 'failed', 'Cancelled by user', 'plan_failed');
      this.reasoningEngine.endReasoning(request.requestId);
      const cancelledResponse: AIResponse = {
        requestId: request.requestId,
        userId: request.userId,
        sessionId: request.sessionId,
        conversationId: request.conversationId,
        message: 'Request was cancelled.',
        intent,
        task: { ...agentTask, status: 'cancelled' },
        status: 'cancelled',
        verificationStatus: 'FAILED',
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
      return ok(cancelledResponse);
    }

    // ─── Build Context ─────────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(
      request.requestId,
      'retrieving',
      'Assembling context sources',
      'context_assembled',
    );

    const contextResult = await this.contextEngine.buildContext(request, intent);
    if (!contextResult.ok) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'failed',
        'Context assembly failed',
        'plan_failed',
      );
      return fail(contextResult.error);
    }
    const context = contextResult.value;

    // ─── Reasoning Assessment ──────────────────────────────────────────────

    const assessment = this.reasoningEngine.assessRequest(request, intent, context);

    // ─── Explicit Memory Directives (Prompt 4 Production Flow) ─────────────
    if (intent.type === 'MEMORY_STORE') {
      return this.handleMemoryStore(request, intent, context, startTime, agentTask);
    }
    if (intent.type === 'MEMORY_FORGET') {
      return this.handleMemoryForget(request, intent, context, startTime, agentTask);
    }
    if (intent.type === 'GREETING') {
      return this.handleGreeting(request, intent, context, startTime, agentTask);
    }

    // ─── Clarification Handling ────────────────────────────────────────────

    const history = context.conversationHistory || [];
    const hasPriorContext = history.some((m: any) =>
      /project|deadline|due|task|commitments|friday|monday/i.test(m.content),
    );

    const isExplicitAmbiguous =
      intent.type === 'CLARIFICATION' ||
      intent.type === 'CLARIFICATION_REQUIRED' ||
      /^(?:do it|fix it|run it|update it|delete it)\.?$/i.test(request.message.trim());

    const needsClarification =
      isExplicitAmbiguous ||
      (((intent.requiresClarification && intent.clarificationPrompt) ||
        assessment.strategy === 'CLARIFICATION') &&
        !hasPriorContext);

    if (!needsClarification && intent.requiresClarification) {
      (intent as any).requiresClarification = false;
      (intent as any).clarificationPrompt = undefined;
    }

    if (needsClarification) {
      const clarificationText =
        intent.clarificationPrompt ||
        assessment.clarificationReason ||
        'Could you please provide more details on what you would like to do?';

      this.reasoningEngine.updateStatus(
        request.requestId,
        'completed',
        'Clarification requested from user',
        'clarification_required',
      );
      this.reasoningEngine.endReasoning(request.requestId);

      const multiConfidence = this.confEngine.assessMultiDimensional(
        request.message,
        intent,
        context,
        clarificationText,
      );

      const turnPayload = this.convManager.buildStructuredTurnPayload(
        request.conversationId,
        turn.turnId,
        request.message,
        intent,
        (context.conversationHistory || []).map((m: any) => ({ role: m.role, content: m.content })),
        (intent.entities || []).reduce((acc: any, e: any) => ({ ...acc, [e.name || e.type]: e.value }), {}),
        {},
        true,
        clarificationText,
      );

      this.convManager.completeTurn(request.conversationId, turn.turnId, clarificationText);

      const clarificationResponse: AIResponse = {
        requestId: request.requestId,
        userId: request.userId,
        sessionId: request.sessionId,
        conversationId: request.conversationId,
        message: clarificationText,
        intent,
        task: { ...agentTask, status: 'waiting' },
        assessment,
        status: 'clarification_required',
        confidence: 'LOW_CONFIDENCE',
        multiConfidence,
        turnPayload,
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      };

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
        clarificationText,
      );

      return ok(clarificationResponse);
    }

    // ─── Evidence Collection & Reliability Setup (Prompt 25) ─────────────
    const evidence: EvidenceItem[] = [
      {
        sourceType: 'user_input',
        content: request.message,
        relevance: 1.0,
        verified: true,
        verificationStatus: 'VERIFIED',
      },
    ];

    if (context.ragContext?.documents) {
      for (const doc of context.ragContext.documents) {
        evidence.push({
          sourceType: 'retrieved_knowledge',
          sourceId: doc.documentId,
          content: doc.content,
          relevance: doc.score,
          verified: true,
          verificationStatus: 'VERIFIED',
          metadata: { chunkId: doc.chunkId, title: doc.metadata?.title },
        });
      }
    }

    if (context.longTermMemory) {
      for (const mem of context.longTermMemory) {
        evidence.push({
          sourceType: 'approved_memory',
          sourceId: mem.id,
          content: mem.content,
          relevance: mem.importance,
          verified: true,
          verificationStatus: 'VERIFIED',
          metadata: { type: mem.type },
        });
      }
    }

    // ─── Planning & Action Preparation ─────────────────────────────────────

    let activePlan: ActionPlan | undefined = undefined;
    let planExecutionResult: PlanExecutionResult | undefined = undefined;
    let toolExecuted = false;
    let toolSuccess = false;
    let toolVerified = true;
    let toolResultContext = '';

    const authCtx = {
      userId: request.userId,
      sessionId: request.sessionId,
      roles: ['user'],
      permissions: ['*'],
    };

    // ─── Prompt 7: Pure Reasoning & Agent Planning Request Flow ───────────
    if (
      intent.primaryIntent === 'PLANNING_DECISION' ||
      (request.options as any)?.planOnly ||
      (request.options as any)?.planningOnly
    ) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'planning',
        'Formulating structured reasoning & agent plan',
        'reasoning_in_progress',
      );

      const agentPlan = await planningEngine.createAgentPlan(request, authCtx, {
        context,
        intent,
        correlationId: request.requestId,
      });

      this.reasoningEngine.updateStatus(
        request.requestId,
        'completed',
        `Plan generated with status: ${agentPlan.status}`,
        agentPlan.status === 'READY' ? 'plan_created' : 'plan_failed',
      );
      this.reasoningEngine.endReasoning(request.requestId);

      const planSummary =
        agentPlan.summary ||
        `Plan generated with ${agentPlan.steps.length} steps for goal: ${agentPlan.goal.description}`;

      const planResponse: AIResponse = {
        requestId: request.requestId,
        userId: request.userId,
        sessionId: request.sessionId,
        conversationId: request.conversationId,
        message: planSummary,
        intent,
        task: { ...agentTask, status: agentPlan.status === 'READY' ? 'completed' : 'planning' },
        agentPlan,
        assessment,
        status:
          agentPlan.status === 'NEEDS_CLARIFICATION'
            ? 'clarification_required'
            : agentPlan.status === 'BLOCKED'
              ? 'blocked'
              : 'ready',
        verificationStatus: agentPlan.status === 'READY' ? 'VERIFIED' : 'PENDING',
        evidence,
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
      return ok(planResponse);
    }

    if (
      intent.requiresTool ||
      intent.type === 'PROJECT_WORKSPACE_TASK' ||
      intent.type === 'AUTOMATION_REQUEST'
    ) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'planning',
        'Formulating tool execution plan',
        'reasoning_in_progress',
      );

      const plan = await planningEngine.createPlan(request.message, authCtx, { context, intent });
      const planValidation = planningEngine.validatePlan(plan, authCtx);

      if (planValidation.requiresConfirmation) {
        const confStep = planValidation.confirmationSteps[0] || plan.steps[0];
        const stepInput = (confStep && 'toolInput' in confStep ? confStep.toolInput : (confStep as any)?.input) || {};
        const confReq = this.confManager.createConfirmationRequest(
          confStep?.toolName || 'execute_action',
          stepInput,
          `Action requires confirmation:\n• WHAT: ${confStep?.description}\n• WHY: High impact action modifying permanent records\n• WHICH RESOURCE: ${JSON.stringify(stepInput)}`,
        );

        this.reasoningEngine.updateStatus(
          request.requestId,
          'completed',
          'Confirmation required for action',
          'confirmation_required',
        );
        this.reasoningEngine.endReasoning(request.requestId);

        const confResponse: AIResponse = {
          requestId: request.requestId,
          userId: request.userId,
          sessionId: request.sessionId,
          conversationId: request.conversationId,
          message: confReq.description,
          intent,
          task: { ...agentTask, status: 'waiting' },
          plan,
          assessment,
          status: 'confirmation_required',
          confirmationRequest: confReq,
          verificationStatus: 'PENDING',
          evidence,
          latencyMs: Date.now() - startTime,
          timestamp: Date.now(),
        };
        return ok(confResponse);
      }

      activePlan = plan;
      this.reasoningEngine.updateStatus(
        request.requestId,
        'planning',
        `Generated plan with ${plan.totalSteps} steps`,
        'plan_created',
      );

      if (plan.steps.length > 0) {
        toolExecuted = true;
        this.reasoningEngine.updateStatus(
          request.requestId,
          'generating',
          'Executing plan steps',
          'plan_executing',
        );

        const planResult = await planExecutor.executePlan(
          plan,
          {
            auth: authCtx,
            traceId: request.requestId,
            conversationId: request.conversationId,
            requestId: request.requestId,
          },
          { idempotencyKey: request.requestId },
        );

        planExecutionResult = planResult;
        toolSuccess = planResult.status === 'SUCCESS' || planResult.status === 'PARTIAL_SUCCESS';
        toolVerified = planResult.steps.every((s) => s.status !== 'completed' || s.verified);
        if (planResult.evidence) {
          evidence.push(...planResult.evidence);
        }

        toolResultContext = `\n[Backend Execution & Verification Result]\nPlan Status: ${planResult.status}\nVerification: ${planResult.verificationStatus ?? (toolVerified ? 'VERIFIED' : 'NOT_VERIFIABLE')}\nSummary: ${planResult.summary}\nSteps:\n${JSON.stringify(
          planResult.steps.map((s) => ({
            step: s.stepNumber,
            description: s.description,
            status: s.status,
            verified: s.verified,
            verificationStatus: s.verificationStatus,
            details: s.verificationDetails,
            result: s.result,
            error: s.error,
          })),
          null,
          2,
        )}`;
      }
    } else if (
      assessment.requiresPlan &&
      (assessment.complexity === 'COMPLEX' || assessment.complexity === 'MULTI_STEP')
    ) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'planning',
        'Formulating structured cognitive plan',
        'reasoning_in_progress',
      );

      const cognitivePlan = planningEngine.createCognitivePlan(request.message, intent, context);
      const planValidation = planningEngine.validatePlan(cognitivePlan);
      if (planValidation.valid) {
        activePlan = cognitivePlan;
        this.reasoningEngine.updateStatus(
          request.requestId,
          'planning',
          `Created structured plan: ${cognitivePlan.totalSteps} steps`,
          'plan_created',
        );
      }
    }

    // ─── Build Prompt ──────────────────────────────────────────────────────

    const promptResult = this.promptEngine.build(request.message, context, {
      includeRAG: intent.requiresRAG,
      includeMemory: intent.requiresMemory,
    });
    if (!promptResult.ok) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'failed',
        'Prompt build failed',
        'plan_failed',
      );
      return fail(promptResult.error);
    }
    const prompt = promptResult.value;

    // Inject Aether System Context, Strategy Guidance, & Tool Results
    const strategyInstruction = buildStrategyInstruction(assessment.strategy);
    const strategyContext = strategyInstruction ? `\n\n${strategyInstruction}` : '';
    const systemContent = `${buildAetherSystemPrompt()}\n\n${prompt.system}${strategyContext}${toolResultContext}`;

    // ─── Generate ──────────────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(
      request.requestId,
      'generating',
      'Generating model response',
      'plan_executing',
    );

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
      this.reasoningEngine.updateStatus(
        request.requestId,
        'failed',
        'Generation failed',
        'plan_failed',
      );
      return ok(
        this.responseEngine.buildError(request, intent, execution.result.error.code, startTime),
      );
    }

    const genResponse = execution.result.value;

    // ─── Safety: Output Check ──────────────────────────────────────────────

    this.safetyEngine.checkOutput(genResponse.content);

    // ─── Response Synthesis (when native model output is insufficient) ─────
    let synthesizedContent = genResponse.content;
    const modelMetadata = (genResponse as any).metadata;
    const needsSynthesis =
      responseSynthesizer.needsSynthesis(genResponse.content) ||
      modelMetadata?.needsSynthesis === true;

    if (needsSynthesis) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'generating',
        'Synthesizing contextual response',
        'plan_executing',
      );

      const synthesisResult = responseSynthesizer.synthesize({
        request,
        intent,
        context,
        assessment,
        nativeModelOutput: genResponse.content || undefined,
        nativeModelTokenCount: genResponse.usage?.completionTokens,
        nativeModelConfidence: modelMetadata?.confidence,
        evidence,
        toolResults: planExecutionResult?.steps?.map((s) => s.result),
        planSummary: planExecutionResult?.summary,
      });

      synthesizedContent = synthesisResult.content;
    }

    // ─── Verification State Determination (Prompt 25) ─────────────────────
    let verificationStatus: VerificationStatus;
    if (toolExecuted) {
      if (planExecutionResult?.verificationStatus) {
        verificationStatus = planExecutionResult.verificationStatus;
      } else if (!toolSuccess) {
        verificationStatus = 'FAILED';
      } else if (toolVerified) {
        verificationStatus = 'VERIFIED';
      } else {
        verificationStatus = 'NOT_VERIFIABLE';
      }
    } else if (intent.requiresTool) {
      verificationStatus = 'UNVERIFIED';
    } else if (intent.requiresRAG || intent.type === 'KNOWLEDGE_QUESTION') {
      verificationStatus = (context.ragContext?.documents.length ?? 0) > 0 ? 'VERIFIED' : 'FAILED';
    } else {
      verificationStatus = 'NOT_VERIFIABLE';
    }

    const executionReliabilityState: ExecutionReliabilityState = {
      plan: activePlan,
      toolResults: planExecutionResult?.steps?.map((s) => s.result),
      evidence,
      verificationStatus,
      errors: planExecutionResult?.error ? [planExecutionResult.error] : undefined,
      toolExecuted,
      toolSuccess,
      verifiedStepsCount: planExecutionResult?.successfulStepsCount ?? 0,
      totalStepsCount: planExecutionResult?.steps?.length ?? (toolExecuted ? 1 : 0),
    };

    // ─── Response Validation ───────────────────────────────────────────────

    const validationRes = this.respValidator.validate(
      request,
      intent,
      context,
      synthesizedContent,
      executionReliabilityState,
    );
    const finalContent = validationRes.correctedContent ?? synthesizedContent;
    const finalVerificationStatus = validationRes.verificationStatus ?? verificationStatus;

    // ─── Confidence Assessment ─────────────────────────────────────────────

    const confidenceAssessment = this.confEngine.assess(
      request.message,
      intent,
      context,
      finalContent,
      executionReliabilityState,
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

    // ─── Memory Extraction & Persistence Pipeline ─────────────────────────
    const candidates = memoryExtractor.extract(request.userId, request.message);
    if (candidates.length > 0) {
      const existingMemoriesRes = await this.memoryEngine.getAllMemory(request.userId);
      const existing = existingMemoriesRes.ok ? existingMemoriesRes.value : [];
      for (const candidate of candidates) {
        if ((candidate as any).action === 'forget') {
          await this.memoryEngine.forgetMemoryByContent(request.userId, candidate.content);
          continue;
        }
        const classification = memoryClassifier.classify(candidate, existing);
        if (classification.accepted) {
          if (classification.action === 'supersede' && classification.targetMemoryIdToSupersede) {
            await this.memoryEngine.updateMemory({
              id: classification.targetMemoryIdToSupersede,
              userId: request.userId,
              content: classification.sanitizedContent,
              importance: classification.importance,
              confidence: classification.confidence,
              metadata: {
                status: 'superseded',
                confidence: classification.confidence,
                source: candidate.source,
              },
            });
          }
          const scope: MemoryScope =
            request.scope ??
            (request.projectId ? 'PROJECT' : request.workspaceId ? 'WORKSPACE' : 'GLOBAL_USER');
          await this.memoryEngine.createMemory({
            userId: request.userId,
            workspaceId: request.workspaceId,
            projectId: request.projectId,
            type: classification.category,
            scope,
            content: classification.sanitizedContent,
            importance: classification.importance,
            confidence: classification.confidence,
            metadata: {
              status: 'active',
              confidence: classification.confidence,
              source: candidate.source,
            },
          });
        }
      }
    }

    // ─── Finalize Reasoning ────────────────────────────────────────────────

    this.reasoningEngine.updateStatus(
      request.requestId,
      'completed',
      'Response finalized',
      'plan_completed',
    );
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
      finalVerificationStatus,
      evidence,
    );

    const multiConfidence = this.confEngine.assessMultiDimensional(
      request.message,
      intent,
      context,
      finalContent,
      executionReliabilityState,
    );

    const turnPayload = this.convManager.buildStructuredTurnPayload(
      request.conversationId,
      turn.turnId,
      request.message,
      intent,
      (context.conversationHistory || []).map((m: any) => ({ role: m.role, content: m.content })),
      (intent.entities || []).reduce((acc: any, e: any) => ({ ...acc, [e.name || e.type]: e.value }), {}),
      {},
      false,
      null,
    );

    this.convManager.completeTurn(request.conversationId, turn.turnId, finalContent);

    const finalTaskStatus = finalVerificationStatus === 'FAILED' ? 'failed' : 'completed';

    const response: AIResponse = {
      ...baseResponse,
      task: {
        ...agentTask,
        status: finalTaskStatus,
      },
      confidence: confidenceAssessment.level,
      multiConfidence,
      turnPayload,
      verificationStatus: finalVerificationStatus,
      evidence,
      plan: activePlan,
      assessment,
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

    this.reasoningEngine.startReasoning(request.requestId);
    this.reasoningEngine.updateStatus(
      request.requestId,
      'thinking',
      'Classifying user intent',
      'request_received',
    );

    const intentResult = this.intentEngine.classify(request.message);
    const intent: Intent = intentResult.ok ? intentResult.value : this.classifyFallback();
    this.reasoningEngine.updateStatus(
      request.requestId,
      'thinking',
      `Identified intent: ${intent.type}`,
      'intent_identified',
    );

    this.reasoningEngine.updateStatus(
      request.requestId,
      'retrieving',
      'Assembling context sources',
      'context_assembled',
    );

    const contextResult = await this.contextEngine.buildContext(request, intent);
    if (!contextResult.ok) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'failed',
        'Context assembly failed',
        'plan_failed',
      );
      return fail(contextResult.error);
    }
    const context = contextResult.value;

    const assessment = this.reasoningEngine.assessRequest(request, intent, context);

    if (
      (intent.requiresClarification && intent.clarificationPrompt) ||
      assessment.strategy === 'CLARIFICATION'
    ) {
      const clarificationText =
        intent.clarificationPrompt ||
        assessment.clarificationReason ||
        'Could you please provide more details on what you would like to do?';

      const handle = this.streamingEngine.createStream(request.requestId, subscriber);
      this.streamingEngine.onLLMChunk(handle, {
        requestId: request.requestId,
        modelId: request.options?.modelId ?? 'default',
        delta: clarificationText,
        index: 0,
        isLast: true,
      });

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
        clarificationText,
      );

      this.reasoningEngine.updateStatus(
        request.requestId,
        'completed',
        'Clarification stream completed',
        'clarification_required',
      );
      this.reasoningEngine.endReasoning(request.requestId);

      return ok(undefined);
    }

    const promptResult = this.promptEngine.build(request.message, context, {
      includeRAG: intent.requiresRAG,
      includeMemory: intent.requiresMemory,
    });
    if (!promptResult.ok) {
      this.reasoningEngine.updateStatus(
        request.requestId,
        'failed',
        'Prompt build failed',
        'plan_failed',
      );
      return fail(promptResult.error);
    }

    const prompt = promptResult.value;
    const strategyInstruction = buildStrategyInstruction(assessment.strategy);
    const strategyContext = strategyInstruction ? `\n\n${strategyInstruction}` : '';
    const systemContent = `${buildAetherSystemPrompt()}\n\n${prompt.system}${strategyContext}`;
    const messages = [
      { role: 'system' as const, content: systemContent },
      ...prompt.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    this.reasoningEngine.updateStatus(
      request.requestId,
      'generating',
      'Streaming model response',
      'plan_executing',
    );

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
      // Instead of failing, try to synthesize a response
      this.reasoningEngine.updateStatus(
        request.requestId,
        'generating',
        'Synthesizing contextual response',
        'plan_executing',
      );

      const synthesisResult = responseSynthesizer.synthesize({
        request,
        intent,
        context,
        assessment,
        nativeModelOutput: accumulatedContent || undefined,
      });

      // Stream the synthesized response word-by-word
      const words = synthesisResult.content.split(/(\s+)/);
      for (let i = 0; i < words.length; i++) {
        if (handle.isCancelled) break;
        const isLast = i === words.length - 1;
        this.streamingEngine.onLLMChunk(handle, {
          requestId: request.requestId,
          modelId: request.options?.modelId ?? 'default',
          delta: words[i],
          index: i,
          isLast,
        });
      }
      accumulatedContent = synthesisResult.content;
    }

    // ─── Post-stream synthesis check ──────────────────────────────────────
    // If the model streamed but produced incoherent output, re-synthesize
    if (
      accumulatedContent &&
      responseSynthesizer.needsSynthesis(accumulatedContent)
    ) {
      const synthesisResult = responseSynthesizer.synthesize({
        request,
        intent,
        context,
        assessment,
        nativeModelOutput: accumulatedContent,
      });

      // Stream the synthesized replacement
      const words = synthesisResult.content.split(/(\s+)/);
      for (let i = 0; i < words.length; i++) {
        if (handle.isCancelled) break;
        const isLast = i === words.length - 1;
        this.streamingEngine.onLLMChunk(handle, {
          requestId: request.requestId,
          modelId: request.options?.modelId ?? 'default',
          delta: words[i],
          index: 1000 + i,
          isLast,
        });
      }
      accumulatedContent = synthesisResult.content;
    }

    // If nothing was streamed at all (empty response), synthesize
    if (!accumulatedContent || accumulatedContent.trim().length === 0) {
      const synthesisResult = responseSynthesizer.synthesize({
        request,
        intent,
        context,
        assessment,
      });

      const words = synthesisResult.content.split(/(\s+)/);
      for (let i = 0; i < words.length; i++) {
        if (handle.isCancelled) break;
        const isLast = i === words.length - 1;
        this.streamingEngine.onLLMChunk(handle, {
          requestId: request.requestId,
          modelId: request.options?.modelId ?? 'default',
          delta: words[i],
          index: 2000 + i,
          isLast,
        });
      }
      accumulatedContent = synthesisResult.content;
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

    // Extract & update memory from streaming turns
    const streamCandidates = memoryExtractor.extract(request.userId, request.message);
    if (streamCandidates.length > 0) {
      const existingMemoriesRes = await this.memoryEngine.getAllMemory(request.userId);
      const existing = existingMemoriesRes.ok ? existingMemoriesRes.value : [];
      for (const candidate of streamCandidates) {
        const classification = memoryClassifier.classify(candidate, existing);
        if (classification.accepted) {
          if (classification.action === 'supersede' && classification.targetMemoryIdToSupersede) {
            await this.memoryEngine.updateMemory({
              id: classification.targetMemoryIdToSupersede,
              userId: request.userId,
              content: classification.sanitizedContent,
              importance: classification.importance,
              metadata: {
                status: 'active',
                confidence: classification.confidence,
                source: candidate.source,
              },
            });
          } else if (classification.action === 'create') {
            await this.memoryEngine.createMemory({
              userId: request.userId,
              type: classification.category,
              content: classification.sanitizedContent,
              importance: classification.importance,
              metadata: {
                status: 'active',
                confidence: classification.confidence,
                source: candidate.source,
              },
            });
          }
        }
      }
    }

    this.streamingEngine.completeStream(handle);
    this.reasoningEngine.updateStatus(request.requestId, 'completed');
    this.reasoningEngine.endReasoning(request.requestId);

    return ok(undefined);
  }

  private async handleMemoryStore(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
    startTime: number,
    agentTask: AgentTask,
  ): Promise<Result<AIResponse>> {
    const rawCandidates = memoryExtractor.extract(request.userId, request.message);
    const storeCandidates = rawCandidates.filter((c) => (c as any).action !== 'forget');
    const candidate = storeCandidates[0] || {
      userId: request.userId,
      content: request.message
        .replace(/^(?:please\s+)?(?:remember\s+that|remember:|note\s+that|remember)\s*/i, '')
        .trim(),
      type: 'fact' as MemoryType,
      importance: 0.85,
      source: 'user_explicit',
      action: 'store' as const,
    };

    const existingRes = await this.memoryEngine.getAllMemory(request.userId);
    const existingMemories = existingRes.ok ? existingRes.value : [];

    const classification = memoryClassifier.classify(candidate, existingMemories);

    let responseMessage: string;
    let verificationStatus: VerificationStatus = 'VERIFIED';

    if (!classification.accepted) {
      responseMessage = `I cannot store that in memory. ${classification.reason || 'For privacy and security, sensitive information like credentials and API keys cannot be saved.'}`;
      verificationStatus = 'FAILED';
    } else {
      if (classification.action === 'supersede' && classification.targetMemoryIdToSupersede) {
        await this.memoryEngine.updateMemory({
          id: classification.targetMemoryIdToSupersede,
          userId: request.userId,
          metadata: { status: 'superseded' },
        });
      }

      const scope: MemoryScope =
        request.scope ??
        (request.projectId ? 'PROJECT' : request.workspaceId ? 'WORKSPACE' : 'GLOBAL_USER');

      const createRes = await this.memoryEngine.createMemory({
        userId: request.userId,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        type: classification.category,
        scope,
        content: classification.sanitizedContent,
        importance: classification.importance,
        confidence: classification.confidence,
        metadata: {
          source: candidate.source || 'user_explicit',
        },
      });

      if (!createRes.ok) {
        responseMessage = `Failed to store memory: ${createRes.error.message}`;
        verificationStatus = 'FAILED';
      } else {
        responseMessage = `I've noted that and stored it in your persistent memory: "${classification.sanitizedContent}".`;
      }
    }

    this.reasoningEngine.updateStatus(
      request.requestId,
      'completed',
      'Memory store directive completed',
      'plan_completed',
    );
    this.reasoningEngine.endReasoning(request.requestId);

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
      responseMessage,
    );
    this.convManager.completeTurn(
      request.conversationId,
      `turn_${request.requestId}`,
      responseMessage,
    );

    const response: AIResponse = {
      requestId: request.requestId,
      userId: request.userId,
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      message: responseMessage,
      intent,
      task: { ...agentTask, status: 'completed' },
      status: 'success',
      verificationStatus,
      confidence: 'HIGH_CONFIDENCE',
      latencyMs: Date.now() - startTime,
      timestamp: Date.now(),
    };

    return ok(response);
  }

  private async handleMemoryForget(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
    startTime: number,
    agentTask: AgentTask,
  ): Promise<Result<AIResponse>> {
    const rawCandidates = memoryExtractor.extract(request.userId, request.message);
    const forgetCandidate = rawCandidates.find((c) => (c as any).action === 'forget');

    let targetQuery = forgetCandidate?.content;
    if (!targetQuery) {
      const match = request.message.match(
        /(?:please\s+)?(?:forget(?:\s+that)?|don't\s+remember(?:\s+that)?|stop\s+remembering(?:\s+that)?|remove\s+(?:the\s+)?memory(?:\s+about)?|delete\s+(?:the\s+)?memory(?:\s+about)?|erase\s+(?:the\s+)?memory(?:\s+about)?)\s*[:,-]?\s+([^.!?]+)/i,
      );
      targetQuery = match && match[1]
        ? match[1].trim()
        : request.message.replace(/^(?:please\s+)?(?:forget|don't\s+remember|stop\s+remembering|remove\s+memory)\s*/i, '').trim();
    }

    const forgetRes = await this.memoryEngine.forgetMemoryByContent(request.userId, targetQuery);
    const deletedCount = forgetRes.ok ? forgetRes.value : 0;

    let responseMessage: string;
    let verificationStatus: VerificationStatus = 'VERIFIED';

    if (!forgetRes.ok) {
      responseMessage = `Failed to process forget request: ${forgetRes.error.message}`;
      verificationStatus = 'FAILED';
    } else if (deletedCount > 0) {
      responseMessage = `I have forgotten that information from your persistent memory (${deletedCount} item${deletedCount > 1 ? 's' : ''} removed).`;
    } else {
      responseMessage = `I couldn't find any stored memory matching "${targetQuery}" to forget.`;
    }

    this.reasoningEngine.updateStatus(
      request.requestId,
      'completed',
      'Memory forget directive completed',
      'plan_completed',
    );
    this.reasoningEngine.endReasoning(request.requestId);

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
      responseMessage,
    );
    this.convManager.completeTurn(
      request.conversationId,
      `turn_${request.requestId}`,
      responseMessage,
    );

    const response: AIResponse = {
      requestId: request.requestId,
      userId: request.userId,
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      message: responseMessage,
      intent,
      task: { ...agentTask, status: 'completed' },
      status: 'success',
      verificationStatus,
      confidence: 'HIGH_CONFIDENCE',
      latencyMs: Date.now() - startTime,
      timestamp: Date.now(),
    };

    return ok(response);
  }

  private handleGreeting(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
    startTime: number,
    agentTask: AgentTask,
  ): Result<AIResponse> {
    const greetingMsg = "Hello! I'm Aether. I can help you organize tasks, plan projects, manage your week, work with your knowledge, and figure out what to do next.\\n\\nWhat would you like to work on?";

    this.reasoningEngine.updateStatus(
      request.requestId,
      'completed',
      'Greeting response delivered',
      'plan_completed',
    );
    this.reasoningEngine.endReasoning(request.requestId);

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
      greetingMsg,
    );
    this.convManager.completeTurn(
      request.conversationId,
      `turn_${request.requestId}`,
      greetingMsg,
    );

    const response: AIResponse = {
      requestId: request.requestId,
      userId: request.userId,
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      message: greetingMsg,
      intent,
      task: { ...agentTask, status: 'completed' },
      status: 'ready',
      verificationStatus: 'VERIFIED',
      confidence: 'HIGH_CONFIDENCE',
      latencyMs: Date.now() - startTime,
      timestamp: Date.now(),
    };

    return ok(response);
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
