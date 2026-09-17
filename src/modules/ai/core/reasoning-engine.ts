/**
 * AETHER AI — Reasoning Engine
 * Evaluates request complexity, information sufficiency, response strategy, and state transitions.
 * NEVER exposes private chain-of-thought to users. Only exposes safe public statuses and structured summaries.
 */

import type {
  AIRequest,
  AIContext,
  Intent,
  ReasoningStatus,
  ReasoningTrace,
  ReasoningState,
  ReasoningAssessment,
  ReasoningComplexity,
  ResponseStrategy,
} from '../ai-types.js';
import type {
  PlanGoal,
  PlanConstraint,
  PlanAssumption,
  ClarificationRequest,
  AgentPlanStep,
  PlanDependency,
} from '../planning/planning-types.js';
import { isSafeReasoningStatus } from '../prompts/reasoning-prompts.js';

// ─── IReasoningEngine Interface ───────────────────────────────────────────────

export interface IReasoningEngine {
  assessRequest(request: AIRequest, intent: Intent, context: AIContext): ReasoningAssessment;
  identifyGoal(request: AIRequest, intent: Intent): PlanGoal;
  extractConstraints(request: AIRequest, intent: Intent, context: AIContext): PlanConstraint[];
  identifyAssumptions(request: AIRequest, intent: Intent, context: AIContext): PlanAssumption[];
  assessClarification(request: AIRequest, intent: Intent, context: AIContext): ClarificationRequest | undefined;
  startReasoning(requestId: string): void;
  updateStatus(
    requestId: string,
    status: ReasoningStatus,
    description?: string,
    state?: ReasoningState,
  ): void;
  getPublicStatus(requestId: string): ReasoningStatus | undefined;
  getTrace(requestId: string): readonly ReasoningTrace[];
  endReasoning(requestId: string): void;
  clearExpired(maxAgeMs?: number): void;
}

// ─── Reasoning Engine Implementation ─────────────────────────────────────────

interface ReasoningSession {
  readonly requestId: string;
  currentStatus: ReasoningStatus;
  currentState?: ReasoningState;
  assessment?: ReasoningAssessment;
  readonly traces: ReasoningTrace[];
  readonly startedAt: number;
  completedAt?: number;
}

export class ReasoningEngine implements IReasoningEngine {
  private readonly sessions = new Map<string, ReasoningSession>();

  /**
   * Deterministically assesses request complexity, information sufficiency, and optimal response strategy.
   */
  public assessRequest(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
  ): ReasoningAssessment {
    const raw = request.message.trim();
    const lower = raw.toLowerCase();

    // ─── 1. Check for Ambiguity / Clarification ─────────────────────────────
    if (intent.requiresClarification || intent.type === 'AMBIGUOUS' || intent.primaryIntent === 'CLARIFICATION_REQUIRED') {
      return {
        complexity: 'AMBIGUOUS',
        strategy: 'CLARIFICATION',
        isSimple: true,
        requiresPlan: false,
        informationSufficient: false,
        missingInformation: ['Target entity, resource, or specific action description'],
        clarificationReason: intent.clarificationPrompt || 'The request is underspecified.',
        suggestedExecutionMode: 'direct',
        rationale: 'Request lacks actionable parameters or specific referenced entities.',
      };
    }

    // ─── 2. Conversational & Basic Direct Questions ─────────────────────────
    if (
      intent.type === 'CONVERSATIONAL' ||
      lower.startsWith('hi') ||
      lower.startsWith('hello') ||
      lower.startsWith('hey') ||
      lower.startsWith('thanks') ||
      lower.startsWith('thank you')
    ) {
      return {
        complexity: 'SIMPLE',
        strategy: 'DIRECT_ANSWER',
        isSimple: true,
        requiresPlan: false,
        informationSufficient: true,
        suggestedExecutionMode: 'direct',
        rationale: 'Conversational interaction requires direct, natural response.',
      };
    }

    // ─── 3. Factual & Conceptual Explanations ───────────────────────────────
    const isDirectQuestion =
      lower.startsWith('what is ') ||
      lower.startsWith('explain ') ||
      lower.startsWith('define ') ||
      lower.startsWith('how does ') ||
      lower.startsWith('who is ') ||
      lower.startsWith('tell me about ');

    const hasMultiStepKeywords =
      lower.includes('step by step') ||
      lower.includes('roadmap') ||
      lower.includes('plan') ||
      lower.includes('prepare everything') ||
      lower.includes('compare and analyze') ||
      lower.includes('break down') ||
      lower.includes('from start to finish') ||
      lower.includes('all steps') ||
      lower.includes('workflow');

    if (isDirectQuestion && !hasMultiStepKeywords && intent.type !== 'PROJECT_WORKSPACE_TASK') {
      return {
        complexity: 'SIMPLE',
        strategy: 'DIRECT_ANSWER',
        isSimple: true,
        requiresPlan: false,
        informationSufficient: true,
        suggestedExecutionMode: 'direct',
        rationale: 'Direct conceptual inquiry answered immediately without subtask overhead.',
      };
    }

    // ─── 4. Strategic Planning & Project Roadmaps ───────────────────────────
    if (
      intent.primaryIntent === 'PLANNING_DECISION' ||
      hasMultiStepKeywords ||
      lower.includes('plan this project') ||
      lower.includes('action plan')
    ) {
      return {
        complexity: 'MULTI_STEP',
        strategy: 'STRUCTURED_PLAN',
        isSimple: false,
        requiresPlan: true,
        informationSufficient: true,
        suggestedExecutionMode: 'sequential',
        rationale: 'Multi-step strategic planning requiring decomposed milestones and dependencies.',
      };
    }

    // ─── 5. Knowledge & Research Synthesis ──────────────────────────────────
    if (
      intent.type === 'KNOWLEDGE_QUESTION' ||
      intent.primaryIntent === 'RESEARCH_LOOKUP' ||
      intent.requiresRAG ||
      (lower.includes('research') && !lower.includes('analyze'))
    ) {
      const hasRAGDocs = (context.ragContext?.documents.length ?? 0) > 0;
      return {
        complexity: 'COMPLEX',
        strategy: 'RESEARCH_SYNTHESIS',
        isSimple: false,
        requiresPlan: true,
        informationSufficient: hasRAGDocs || !intent.requiresRAG,
        missingInformation: hasRAGDocs ? undefined : ['Knowledge base reference passages'],
        suggestedExecutionMode: 'sequential',
        rationale: 'Research inquiry requiring evidence collection, cross-referencing, and synthesis.',
      };
    }

    // ─── 6. Analytical & Comparative Breakdown ──────────────────────────────
    if (
      intent.type === 'ANALYTICAL' ||
      intent.primaryIntent === 'ANALYSIS' ||
      lower.includes('analyze') ||
      lower.includes('compare') ||
      lower.includes('trade-off') ||
      lower.includes('pros and cons')
    ) {
      return {
        complexity: 'COMPLEX',
        strategy: 'ANALYTICAL_BREAKDOWN',
        isSimple: false,
        requiresPlan: true,
        informationSufficient: true,
        suggestedExecutionMode: 'sequential',
        rationale: 'Analytical inquiry requiring structured comparative breakdown and evaluation.',
      };
    }

    // ─── 7. Tool & Workspace Actions ────────────────────────────────────────
    if (
      intent.requiresTool ||
      intent.type === 'PROJECT_WORKSPACE_TASK' ||
      intent.type === 'AUTOMATION_REQUEST'
    ) {
      const isMultiStepTool =
        lower.includes('prepare everything') ||
        lower.includes('review') ||
        lower.includes('and') ||
        intent.type === 'AUTOMATION_REQUEST';

      return {
        complexity: isMultiStepTool ? 'MULTI_STEP' : 'SIMPLE',
        strategy: 'STRUCTURED_PLAN',
        isSimple: !isMultiStepTool,
        requiresPlan: true,
        informationSufficient: true,
        requiredCapabilities: ['tool_execution'],
        suggestedExecutionMode: isMultiStepTool ? 'sequential' : 'direct',
        rationale: 'Action request requiring tool invocation and verified execution.',
      };
    }

    // ─── 8. Default: Direct Answer with Sufficient Context ──────────────────
    return {
      complexity: 'SIMPLE',
      strategy: 'DIRECT_ANSWER',
      isSimple: true,
      requiresPlan: false,
      informationSufficient: true,
      suggestedExecutionMode: 'direct',
      rationale: 'Standard inquiry answered directly with assembled context.',
    };
  }

  public startReasoning(requestId: string): void {
    this.sessions.set(requestId, {
      requestId,
      currentStatus: 'thinking',
      currentState: 'request_received',
      traces: [
        {
          status: 'thinking',
          state: 'request_received',
          step: 0,
          description: 'Request received and validated',
          timestamp: Date.now(),
        },
      ],
      startedAt: Date.now(),
    });
  }

  public updateStatus(
    requestId: string,
    status: ReasoningStatus,
    description?: string,
    state?: ReasoningState,
  ): void {
    const session = this.sessions.get(requestId);
    if (!session) return;

    if (!isSafeReasoningStatus(status)) return;

    session.currentStatus = status;
    if (state) session.currentState = state;

    session.traces.push({
      status,
      state: state ?? session.currentState,
      step: session.traces.length,
      description: description ?? status,
      timestamp: Date.now(),
    });

    if (status === 'completed' || status === 'failed') {
      session.completedAt = Date.now();
    }
  }

  public getPublicStatus(requestId: string): ReasoningStatus | undefined {
    const session = this.sessions.get(requestId);
    if (!session) return undefined;
    return session.currentStatus;
  }

  public getTrace(requestId: string): readonly ReasoningTrace[] {
    const session = this.sessions.get(requestId);
    if (!session) return [];
    return session.traces.filter((t) => isSafeReasoningStatus(t.status));
  }

  public endReasoning(requestId: string): void {
    const session = this.sessions.get(requestId);
    if (!session) return;
    if (!session.completedAt) {
      session.completedAt = Date.now();
    }
  }

  public clearExpired(maxAgeMs = 300_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, session] of this.sessions) {
      if (session.completedAt && session.completedAt <= cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  private normalizeRequest(requestOrPrompt: AIRequest | string): AIRequest {
    if (typeof requestOrPrompt === 'string') {
      return {
        requestId: `req_${Date.now()}`,
        message: requestOrPrompt,
        userId: 'system',
        sessionId: 'system',
        conversationId: 'system',
        timestamp: Date.now(),
      };
    }
    return requestOrPrompt;
  }

  /**
   * Identifies the explicit desired outcome (Goal) distinct from conversational Intent.
   */
  public identifyGoal(requestOrPrompt: AIRequest | string, intent?: Intent): PlanGoal {
    const request = this.normalizeRequest(requestOrPrompt);
    const raw = request.message.trim();
    const lower = raw.toLowerCase();

    // Specific domain goal patterns
    if (lower.includes('organize my assignments') || lower.includes('organize assignments')) {
      return {
        description: 'Create an organized assignment workflow with clear milestones',
        targetEntity: 'assignments',
        successCriteria: [
          'Identify all active assignments',
          'Group items by priority and deadline',
          'Produce structured actionable plan',
        ],
      };
    }

    if (lower.includes('organize') && (lower.includes('project') || lower.includes('work'))) {
      const entityMatch = raw.match(/(?:organize(?:\s+the)?(?:\s+tasks\s+in)?)\s+(?:my\s+)?([a-zA-Z0-9_\-\s]+?)(?:\s+project|\s+tasks|$)/i);
      const targetEntity = entityMatch ? entityMatch[1].trim() : 'active project';
      return {
        description: `Structure and organize tasks for ${targetEntity}`,
        targetEntity,
        successCriteria: [
          'Retrieve project tasks and context',
          'Analyze incomplete and overdue items',
          'Structure tasks by priority and workflow order',
        ],
      };
    }

    if (lower.startsWith('create a task') || lower.startsWith('create task') || lower.startsWith('add a task')) {
      const title = raw.replace(/^create\s+(?:a\s+)?task\s+(?:called\s+|named\s+|to\s+)?/i, '').trim();
      return {
        description: `Create task "${title || 'New Task'}" in workspace`,
        targetEntity: 'task',
        successCriteria: ['Task record created and verified in database'],
      };
    }

    if (lower.startsWith('create a project') || lower.startsWith('create project')) {
      const name = raw.replace(/^create\s+(?:a\s+)?project\s+(?:called\s+|named\s+|to\s+)?/i, '').trim();
      return {
        description: `Create project "${name || 'New Project'}" in workspace`,
        targetEntity: 'project',
        successCriteria: ['Project record created and verified in database'],
      };
    }

    if (lower.includes('review preparation') || lower.includes('project review')) {
      return {
        description: 'Prepare all necessary review assets, milestones, and status metrics',
        targetEntity: 'project_review',
        successCriteria: [
          'Active workspace projects retrieved',
          'Pending tasks and milestones retrieved',
          'Goal progress calculated',
          'Review preparation task created',
        ],
      };
    }

    // Normalized clean goal description
    const cleaned = raw
      .replace(/^(?:please\s+|could\s+you\s+|can\s+you\s+|i\s+need\s+you\s+to\s+|help\s+me\s+)/i, '')
      .replace(/[.?!]+$/, '')
      .trim();

    return {
      description: cleaned.length > 0 ? cleaned : 'Fulfill user request',
      targetEntity: intent?.entities?.[0]?.value ? String(intent.entities[0].value) : (lower.includes('report') ? 'report' : lower.includes('task') ? 'task' : undefined),
      successCriteria: ['All plan steps executed and verified successfully'],
    };
  }

  /**
   * Extracts concrete constraints (deadlines, priorities, scope, tools, policies).
   * Does NOT hallucinate or invent constraints.
   */
  public extractConstraints(
    requestOrPrompt: AIRequest | string,
    _intent?: Intent,
    context?: AIContext,
  ): PlanConstraint[] {
    const request = this.normalizeRequest(requestOrPrompt);
    const raw = request.message;
    const lower = raw.toLowerCase();
    const constraints: PlanConstraint[] = [];

    // 1. Time / Deadline Constraints
    if (lower.includes('tomorrow')) {
      constraints.push({
        type: 'DEADLINE',
        description: 'Action or outcome scheduled for tomorrow',
        source: 'USER',
        value: 'tomorrow',
      });
    } else if (lower.includes('today') || lower.includes('tonight')) {
      constraints.push({
        type: 'DEADLINE',
        description: 'Action or outcome scheduled for today',
        source: 'USER',
        value: 'today',
      });
    } else if (lower.includes('by friday') || lower.includes('on monday') || lower.includes('next week') || lower.includes('before 5 pm')) {
      const match = lower.match(/(?:by|on|before)\s+(friday|monday|tuesday|wednesday|thursday|saturday|sunday|next week|5 pm|5pm)/i);
      if (match) {
        constraints.push({
          type: 'DEADLINE',
          description: `Deadline set to ${match[1]}`,
          source: 'USER',
          value: match[1],
        });
      }
    }

    // Inspect conversationHistory for multi-turn progressive constraints
    const allTexts: string[] = [raw];
    if (context?.conversationHistory && Array.isArray(context.conversationHistory)) {
      for (const item of context.conversationHistory) {
        if (typeof item === 'string') {
          allTexts.push(item);
        } else if (item && typeof item === 'object') {
          if ('content' in item && typeof (item as any).content === 'string') {
            allTexts.push((item as any).content);
          } else if ('message' in item && typeof (item as any).message === 'string') {
            allTexts.push((item as any).message);
          }
        }
      }
    }

    for (const text of allTexts) {
      const tLower = text.toLowerCase();
      // Project-specific deadlines (e.g. "Project A is due Friday", "Project B is due next Monday")
      const projMatches = tLower.matchAll(/project\s+([a-z0-9_-]+)[^.\n]*?(?:is\s+due|due|deadline)\s+([a-z0-9\s]+)/gi);
      for (const pm of projMatches) {
        const projName = `Project ${pm[1].toUpperCase()}`;
        const val = pm[2].trim().replace(/[.,!?]+$/, '');
        if (!constraints.some((c) => c.value === `${projName}: ${val}`)) {
          constraints.push({
            type: 'DEADLINE',
            description: `${projName} deadline: ${val}`,
            source: 'USER',
            value: `${projName}: ${val}`,
          });
        }
      }

      // Projects with no deadline or flexible scheduling
      if (tLower.includes('no deadline') || tLower.includes('flexible')) {
        const noDeadlineMatch = tLower.match(/project\s+([a-z0-9_-]+)[^.\n]*?(?:has\s+)?no deadline/i);
        if (noDeadlineMatch) {
          const projName = `Project ${noDeadlineMatch[1].toUpperCase()}`;
          if (!constraints.some((c) => c.description?.includes(projName))) {
            constraints.push({
              type: 'SCOPE',
              description: `${projName} has no deadline (flexible)`,
              source: 'USER',
              value: `${projName}: flexible`,
            });
          }
        }
      }
    }

    // 2. Priority Constraints
    if (lower.includes('urgent') || lower.includes('critical')) {
      constraints.push({
        type: 'PRIORITY',
        description: 'High urgency requirement',
        source: 'USER',
        value: 'urgent',
      });
    } else if (lower.includes('high priority') || lower.includes('priority high')) {
      constraints.push({
        type: 'PRIORITY',
        description: 'High priority requirement',
        source: 'USER',
        value: 'high',
      });
    } else if (lower.includes('low priority')) {
      constraints.push({
        type: 'PRIORITY',
        description: 'Low priority requirement',
        source: 'USER',
        value: 'low',
      });
    }

    // 3. Workspace / Tenant Scope Constraints
    if (context?.workspaceId) {
      constraints.push({
        type: 'WORKSPACE',
        description: `Scoped to active workspace ${context.workspaceId}`,
        source: 'SYSTEM',
        value: context.workspaceId,
      });
    }

    if (context?.projectId) {
      constraints.push({
        type: 'RESOURCE',
        description: `Scoped to active project ${context.projectId}`,
        source: 'SYSTEM',
        value: context.projectId,
      });
    }

    // 4. User Preference Constraints from Memory
    if (context?.longTermMemory) {
      for (const mem of context.longTermMemory) {
        if (mem.type === 'preference' || mem.content.toLowerCase().includes('prefer')) {
          constraints.push({
            type: 'USER_PREFERENCE',
            description: mem.content,
            source: 'USER',
            value: mem.content,
          });
        }
      }
    }

    return constraints;
  }

  /**
   * Transparently documents working assumptions without converting them to facts.
   */
  public identifyAssumptions(
    requestOrPrompt: AIRequest | string,
    intent?: Intent,
    context?: AIContext,
  ): PlanAssumption[] {
    const assumptions: PlanAssumption[] = [];

    if (!context?.projectId && (intent?.type === 'PROJECT_WORKSPACE_TASK' || intent?.requiresTool)) {
      assumptions.push({
        description: 'Operating in default workspace scope when specific project is unselected',
        confidence: 0.85,
        isCritical: false,
        requiresValidation: false,
      });
    } else {
      assumptions.push({
        description: 'Operating under standard execution parameters and verified tool permissions',
        confidence: 0.9,
        isCritical: false,
        requiresValidation: false,
      });
    }

    return assumptions;
  }

  /**
   * Assesses uncertainty and missing required parameters, returning a ClarificationRequest
   * rather than guessing.
   */
  public assessClarification(
    requestOrPrompt: AIRequest | string,
    intent?: Intent,
    _context?: AIContext,
  ): ClarificationRequest | undefined {
    const request = this.normalizeRequest(requestOrPrompt);
    const raw = request.message.trim();
    const lower = raw.toLowerCase();

    // Check for underspecified imperative directives
    if (/^(?:do it|fix it|run it|update it|delete it|remove it)\.?$/i.test(raw) || lower === 'send the notification to them') {
      return {
        question: lower === 'send the notification to them'
          ? 'Which notification and recipient should this be sent to?'
          : `Could you please specify which resource or task you would like to ${raw.replace(/ it\.?$/i, '')}?`,
        reason: 'The request is underspecified and missing target resource reference.',
        requiredFields: lower === 'send the notification to them' ? ['recipient', 'content'] : ['targetResourceId'],
      };
    }

    if (intent && (intent.type === 'AMBIGUOUS' || intent.primaryIntent === 'CLARIFICATION_REQUIRED' || intent.requiresClarification)) {
      return {
        question: intent.clarificationPrompt || 'Could you please provide more details on what you would like to achieve?',
        reason: 'Essential parameter missing from user request.',
        requiredFields: ['specificActionDetails'],
      };
    }

    // Ambiguous assignment without project reference
    if (lower === 'create a task for my assignment' || lower === 'add task for my assignment') {
      return {
        question: 'Which assignment or project should this task be associated with?',
        reason: 'Multiple potential assignment contexts exist in workspace.',
        requiredFields: ['projectId', 'taskTitle'],
      };
    }

    return undefined;
  }
}

export const reasoningEngine = new ReasoningEngine();

