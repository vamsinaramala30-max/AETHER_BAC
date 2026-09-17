/**
 * AETHER AI — Intent Engine (Phase 14 Production Grade)
 * Classifies user intent across all 20 standard Phase 14 intents:
 *   GREETING, GENERAL_QUESTION, INFORMATION_REQUEST, TASK_MANAGEMENT,
 *   TASK_CREATION, TASK_PRIORITIZATION, WEEKLY_PLANNING, PROJECT_PLANNING,
 *   PROJECT_MANAGEMENT, PRODUCTIVITY, EXPLANATION, SUMMARIZATION,
 *   MEMORY_STORE, MEMORY_RECALL, KNOWLEDGE_REQUEST, TOOL_REQUEST,
 *   RAG_REQUEST, FOLLOW_UP, CLARIFICATION, UNKNOWN.
 *
 * Employs a layered strategy:
 *   Explicit signals → Contextual signals → Structured state → Safe fallback.
 */

import type {
  Intent,
  IntentType,
  Entity,
  RequiredContext,
  ConfidenceLevel,
  AgentTaskType,
  IIntentAnalyzer,
} from '../ai-types.js';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { IntentFailedError } from '../ai-errors.js';

// ─── IIntentEngine Interface ──────────────────────────────────────────────────

export interface IIntentEngine extends IIntentAnalyzer {
  classify(message: string, context?: unknown): Result<Intent>;
  classifyTaskType(intent: Intent, message?: string): AgentTaskType;
}

// ─── Heuristic Intent Engine ──────────────────────────────────────────────────

export class HeuristicIntentEngine implements IIntentEngine {
  public classify(message: string, context?: unknown): Result<Intent> {
    if (!message || message.trim().length === 0) {
      return fail(new IntentFailedError('Message is empty'));
    }

    try {
      const trimmed = message.trim();
      const lower = trimmed.toLowerCase();
      const history = Array.isArray(context)
        ? context
        : typeof context === 'object' && context !== null && 'conversationHistory' in context
          ? (context as any).conversationHistory
          : [];

      // Extract entities from message
      const entities = this.extractEntities(trimmed, lower);

      // ─── 0. Follow-Up Resolution (Contextual Signals Layer) ───────────────
      const followUpCheck = this.checkFollowUp(lower, trimmed, history, entities);
      if (followUpCheck) {
        return ok(followUpCheck);
      }

      // ─── 1. Greetings ─────────────────────────────────────────────────────
      if (this.isGreeting(lower)) {
        return ok(
          this.buildIntent({
            type: 'GREETING',
            primaryIntent: 'CONVERSATIONAL',
            confidence: 0.95,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Conversational greeting or social opening.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 2. Memory Store ("Remember that...", "Remember my...") ─────────────
      if (
        lower.startsWith('remember that') ||
        lower.startsWith('remember:') ||
        lower.startsWith('remember my') ||
        lower.startsWith('remember i') ||
        lower.startsWith('remember ') ||
        lower.startsWith('please remember') ||
        lower.startsWith('note that') ||
        ((lower.includes('is my highest priority') || lower.includes('is my main project')) &&
          (lower.startsWith('remember') || lower.startsWith('set') || lower.startsWith('note')))
      ) {
        return ok(
          this.buildIntent({
            type: 'MEMORY_STORE',
            primaryIntent: 'MEMORY_REQUEST',
            secondaryIntent: 'MEMORY_STORE',
            confidence: 0.95,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresMemory: true,
            requestedAction: 'store_memory',
            reasoning: 'Request to store persistent user preference or fact.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: false,
            },
            entities,
          }),
        );
      }

      // ─── 2b. Memory Forget ("Forget that...", "Don't remember...") ────────
      if (
        lower.startsWith('forget that') ||
        lower.startsWith('forget ') ||
        lower.startsWith('please forget') ||
        lower.startsWith("don't remember") ||
        lower.startsWith("stop remembering") ||
        lower.startsWith("remove the memory") ||
        lower.startsWith("delete the memory") ||
        lower.startsWith("erase the memory") ||
        lower.includes('forget that') ||
        (lower.includes('forget') &&
          (lower.includes('project') ||
            lower.includes('preference') ||
            lower.includes('used') ||
            lower.includes('uses') ||
            lower.includes('prefer') ||
            lower.includes('language')))
      ) {
        return ok(
          this.buildIntent({
            type: 'MEMORY_FORGET',
            primaryIntent: 'MEMORY_REQUEST',
            secondaryIntent: 'MEMORY_FORGET',
            confidence: 0.95,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresMemory: true,
            requestedAction: 'forget_memory',
            reasoning: 'Request to delete or forget persistent user preference or fact.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: false,
            },
            entities,
          }),
        );
      }

      // ─── 3. Memory Recall ("What is my highest priority?", "Do you remember...") ──
      if (
        lower === 'what is my highest priority?' ||
        lower === 'what is my highest priority' ||
        lower === 'what is my top priority' ||
        lower === 'what was my project called' ||
        lower === 'what is my project called' ||
        lower.startsWith('what do you remember') ||
        lower.startsWith('what did i tell you') ||
        lower.startsWith('do you remember') ||
        lower.startsWith('recall ') ||
        lower.includes('my preference') ||
        lower.includes('my preferences') ||
        (lower.includes('preference') && lower.includes('my')) ||
        (lower.includes('my priority') && (lower.startsWith('what') || lower.startsWith('tell me'))) ||
        (lower.includes('my project') && (lower.startsWith('what') || lower.startsWith('tell me'))) ||
        (lower.includes('language') && lower.includes('prefer')) ||
        (lower.includes('language') && lower.includes('backend')) ||
        (lower.includes('main project') && lower.startsWith('what'))
      ) {
        return ok(
          this.buildIntent({
            type: 'MEMORY_RECALL',
            primaryIntent: 'USER_DATA_QUESTION',
            secondaryIntent: 'MEMORY_RECALL',
            confidence: 0.92,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresMemory: true,
            requestedAction: 'recall_memory',
            reasoning: 'Query asks to retrieve stored memory or persistent preference.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: true,
              workspace: false,
              tools: false,
              system: false,
            },
            entities,
          }),
        );
      }

      // ─── 4. Clarification Request / Information on Planning Requirements ──
      if (
        lower.includes('what information do you need') ||
        lower.includes('what do you need from me') ||
        lower.includes('what details do you need') ||
        lower.includes('how do you plan') ||
        (lower.includes('what info') && lower.includes('plan'))
      ) {
        return ok(
          this.buildIntent({
            type: 'INFORMATION_REQUEST',
            primaryIntent: 'GENERAL_QUESTION',
            secondaryIntent: 'CLARIFICATION',
            confidence: 0.95,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Inquiry asking what inputs or parameters Aether needs for planning.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 5. Capabilities / Information Request ────────────────────────────
      if (this.isCapabilities(lower)) {
        return ok(
          this.buildIntent({
            type: 'INFORMATION_REQUEST',
            primaryIntent: 'CONVERSATIONAL',
            secondaryIntent: 'AETHER_PRODUCT_QUESTION',
            confidence: 0.95,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Capabilities query asking what Aether can help with.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 6. Arithmetic / Calculation (TOOL_REQUEST Fast-Path) ─────────────
      if (this.isCalculation(lower)) {
        return ok(
          this.buildIntent({
            type: 'TOOL_REQUEST',
            primaryIntent: 'GENERAL_QUESTION',
            secondaryIntent: 'REASONING',
            confidence: 0.98,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Direct calculation or arithmetic question.',
            requiredContext: {
              conversation: false,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: false,
            },
            entities,
          }),
        );
      }

      // ─── 7. Project Planning ("I have a website project. Help me create a project plan.") ─
      if (
        (lower.includes('website project') ||
          lower.includes('project plan') ||
          lower.includes('plan my project') ||
          lower.includes('step by step plan') ||
          lower.includes('roadmap for')) &&
        (lower.includes('help') || lower.includes('create') || lower.includes('make') || lower.includes('have a') || lower.includes('plan') || lower.includes('roadmap'))
      ) {
        return ok(
          this.buildIntent({
            type: 'PROJECT_PLANNING',
            primaryIntent: 'PLANNING_DECISION',
            secondaryIntent: 'PROJECT_PLANNING',
            confidence: 0.92,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresAgent: true,
            requestedAction: 'create_project_plan',
            reasoning: 'User requests structured project plan breakdown.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 8. Weekly Planning ("Plan my week", "Help me organize it", "Schedule my week") ──
      const isWeeklyPlanning =
        /^(?:please\s+)?plan my (?:week|schedule|work)\.?$/i.test(trimmed) ||
        lower.includes('plan my week') ||
        lower.includes('schedule my week') ||
        (lower.includes('busy week') && (lower.includes('organize') || lower.includes('help'))) ||
        lower === 'what should i work on first this week?' ||
        lower === 'what should i work on first this week';

      if (isWeeklyPlanning) {
        // If under-specified (no tasks/commitments specified), mark for minimal useful clarification
        const hasSpecificDetails =
          lower.includes('website') ||
          lower.includes('exam') ||
          lower.includes('report') ||
          lower.includes('due') ||
          lower.includes('deadline') ||
          lower.includes('friday');

        return ok(
          this.buildIntent({
            type: 'WEEKLY_PLANNING',
            primaryIntent: 'PLANNING_DECISION',
            secondaryIntent: 'WEEKLY_PLANNING',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresAgent: true,
            requiresClarification: !hasSpecificDetails,
            clarificationPrompt: !hasSpecificDetails
              ? 'I can help plan your week. What tasks and commitments do you need to finish, and which ones have deadlines?'
              : undefined,
            requestedAction: 'plan_week',
            reasoning: 'Weekly planning and time allocation request.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 9. Task Prioritization ("Help me prioritize them", "What should I work on first?") ─
      if (
        lower.includes('prioritize') ||
        lower.includes('prioritization') ||
        lower === 'what should i work on first?' ||
        lower === 'what should i work on first' ||
        lower === 'what should i do first?' ||
        lower === 'what should i do first' ||
        (lower.includes('tasks') && lower.includes('priorit'))
      ) {
        return ok(
          this.buildIntent({
            type: 'TASK_PRIORITIZATION',
            primaryIntent: 'PLANNING_DECISION',
            secondaryIntent: 'TASK_PRIORITIZATION',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresAgent: true,
            requestedAction: 'prioritize_tasks',
            reasoning: 'Task prioritization inquiry or action.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 10. Task Management (Consultative / Organizing) ──────────────────
      if (
        lower.includes('help organizing my tasks') ||
        lower.includes('help me organize my tasks') ||
        lower.includes('organize my tasks') ||
        lower.includes('organize tasks') ||
        lower.includes('task management')
      ) {
        return ok(
          this.buildIntent({
            type: 'TASK_MANAGEMENT',
            primaryIntent: 'TASK_ACTION',
            secondaryIntent: 'TASK_MANAGEMENT',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresAgent: false,
            requestedAction: 'organize_tasks',
            reasoning: 'Consultative task organization and workflow assistance.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 11. Task Creation (Direct DB Actions) ───────────────────────────
      const isTaskCreation =
        lower.startsWith('create task') ||
        lower.startsWith('create a task') ||
        lower.startsWith('add task') ||
        lower.startsWith('add a task') ||
        lower.startsWith('new task') ||
        lower.includes('create a task called') ||
        lower.includes('add a task called');

      if (isTaskCreation) {
        return ok(
          this.buildIntent({
            type: 'TASK_CREATION',
            primaryIntent: 'PROJECT_WORKSPACE_TASK',
            secondaryIntent: 'TASK_CREATION',
            confidence: 0.95,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresTool: true,
            requestedAction: 'create',
            reasoning: 'Explicit task creation mutation.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 12. Project Management (Mutations & Status) ─────────────────────
      if (
        lower.includes('create project') ||
        lower.includes('delete project') ||
        lower.includes('project status') ||
        lower.includes('projects in the workspace') ||
        lower.includes('active projects') ||
        lower.includes('list projects') ||
        lower.includes('show my projects') ||
        lower.includes('show projects')
      ) {
        const action = lower.includes('delete') ? 'delete' : lower.includes('create') ? 'create' : 'status';
        return ok(
          this.buildIntent({
            type: 'PROJECT_MANAGEMENT',
            primaryIntent: 'PROJECT_WORKSPACE_TASK',
            secondaryIntent: 'PROJECT_MANAGEMENT',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresTool: true,
            requestedAction: action,
            reasoning: 'Project lifecycle management operation.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 13. Productivity Queries ─────────────────────────────────────────
      if (
        lower.includes('productivity') ||
        lower.includes('productive') ||
        lower.includes('focus time') ||
        lower.includes('productivity metrics') ||
        lower.includes('improve my daily productivity')
      ) {
        return ok(
          this.buildIntent({
            type: 'PRODUCTIVITY',
            primaryIntent: 'PROJECT_WORKSPACE_TASK',
            secondaryIntent: 'PRODUCTIVITY',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresTool: true,
            requestedAction: 'get_productivity',
            reasoning: 'Productivity metrics inquiry.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 14. Explanations (Conceptual & Technical) ────────────────────────
      if (
        lower.startsWith('explain ') ||
        lower.startsWith('how does ') ||
        lower.startsWith('tell me about ') ||
        lower.includes('what is the difference') ||
        lower.includes('meaning of')
      ) {
        return ok(
          this.buildIntent({
            type: 'EXPLANATION',
            primaryIntent: lower.includes('aether') ? 'AETHER_PRODUCT_QUESTION' : 'GENERAL_QUESTION',
            secondaryIntent: 'EXPLANATION',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Conceptual or technical explanation request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: lower.includes('documentation') || lower.includes('knowledge'),
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 15. General Product & Workspace Questions ────────────────────────
      if (lower.startsWith('what is aether') || lower === 'what is aether?' || lower.includes('who is aether')) {
        return ok(
          this.buildIntent({
            type: 'GENERAL_QUESTION',
            primaryIntent: 'AETHER_PRODUCT_QUESTION',
            secondaryIntent: 'GENERAL_QUESTION',
            confidence: 0.95,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Product identity and architecture question.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 16. Summarization ────────────────────────────────────────────────
      if (
        lower.startsWith('summarize') ||
        lower.includes('summary of') ||
        lower.includes('tldr') ||
        lower.includes('tl;dr') ||
        lower.includes('key points')
      ) {
        return ok(
          this.buildIntent({
            type: 'SUMMARIZATION',
            primaryIntent: 'SUMMARIZATION',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Content summarization request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: true,
              project: false,
              workspace: false,
              tools: false,
              system: false,
            },
            entities,
          }),
        );
      }

      // ─── 17. Knowledge & RAG Search ───────────────────────────────────────
      if (
        lower.startsWith('query the knowledge base') ||
        lower.startsWith('query knowledge base') ||
        lower.includes('query the knowledge base') ||
        lower.includes('query knowledge base') ||
        lower.includes('knowledge base for') ||
        lower.includes('rag search')
      ) {
        return ok(
          this.buildIntent({
            type: 'RAG_REQUEST',
            primaryIntent: 'KNOWLEDGE_QUESTION',
            secondaryIntent: 'RAG_REQUEST',
            confidence: 0.92,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresRAG: true,
            requestedAction: 'rag_query',
            reasoning: 'RAG knowledge base query request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: true,
              project: false,
              workspace: false,
              tools: false,
              system: false,
            },
            entities,
          }),
        );
      }

      if (
        lower.startsWith('search documents') ||
        lower.startsWith('search my documents') ||
        lower.includes('search my documents') ||
        lower.startsWith('search knowledge') ||
        lower.startsWith('find in documents') ||
        lower.includes('according to') ||
        lower.includes('based on the document')
      ) {
        return ok(
          this.buildIntent({
            type: 'KNOWLEDGE_REQUEST',
            primaryIntent: 'KNOWLEDGE_QUESTION',
            secondaryIntent: 'KNOWLEDGE_REQUEST',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresRAG: true,
            requestedAction: 'search_knowledge',
            reasoning: 'Knowledge search request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: true,
              project: false,
              workspace: false,
              tools: false,
              system: false,
            },
            entities,
          }),
        );
      }

      // ─── 18. Ambiguity & Under-specified Requests ────────────────────────
      const ambiguousCheck = this.checkAmbiguity(lower, entities);
      if (ambiguousCheck) {
        return ok(ambiguousCheck);
      }

      // ─── 19. Automation Requests ──────────────────────────────────────────
      if (
        (lower.includes('automation') || lower.includes('workflow') || lower.includes('every monday') || lower.includes('every day')) &&
        (lower.includes('create') || lower.includes('set up') || lower.includes('schedule') || lower.includes('add'))
      ) {
        return ok(
          this.buildIntent({
            type: 'AUTOMATION_REQUEST',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresTool: true,
            requestedAction: 'schedule',
            reasoning: 'Scheduled automation request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: true,
              workspace: true,
              tools: true,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 20. Writing & Drafting ──────────────────────────────────────────
      if (
        lower.startsWith('draft ') ||
        lower.startsWith('write an email') ||
        lower.startsWith('write a message') ||
        lower.startsWith('compose ')
      ) {
        return ok(
          this.buildIntent({
            type: 'WRITING',
            primaryIntent: 'WRITING_CREATION',
            secondaryIntent: 'WRITING',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requestedAction: 'write',
            reasoning: 'Content drafting and writing request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 21. Analytical & Evaluation ──────────────────────────────────────
      if (
        lower.startsWith('analyze') ||
        lower.includes('trade-offs') ||
        lower.includes('compare ') ||
        lower.includes('comparison between')
      ) {
        return ok(
          this.buildIntent({
            type: 'ANALYTICAL',
            primaryIntent: 'ANALYSIS',
            secondaryIntent: 'ANALYTICAL',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            requiresAgent: true,
            reasoning: 'Analytical evaluation and comparison request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 22. Coding & Technical Implementation ────────────────────────────
      if (
        lower.startsWith('write a typescript') ||
        lower.startsWith('write a function') ||
        lower.startsWith('write a python') ||
        lower.includes('typescript') ||
        lower.includes('jwt token') ||
        lower.includes('async function') ||
        lower.includes('code snippet')
      ) {
        return ok(
          this.buildIntent({
            type: 'CODING_TECHNICAL',
            primaryIntent: 'CODING_TECHNICAL',
            secondaryIntent: 'CODING_TECHNICAL',
            confidence: 0.9,
            confidenceLevel: 'HIGH_CONFIDENCE',
            reasoning: 'Coding or technical programming request.',
            requiredContext: {
              conversation: true,
              memory: false,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      // ─── 23. Fallback: General Question / Unknown ─────────────────────────
      if (lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') || lower.startsWith('can')) {
        return ok(
          this.buildIntent({
            type: 'GENERAL_QUESTION',
            primaryIntent: 'GENERAL_REASONING',
            confidence: 0.75,
            confidenceLevel: 'MEDIUM_CONFIDENCE',
            reasoning: 'General inquiry or informational question.',
            requiredContext: {
              conversation: true,
              memory: true,
              rag: false,
              project: false,
              workspace: false,
              tools: false,
              system: true,
            },
            entities,
          }),
        );
      }

      return ok(
        this.buildIntent({
          type: 'UNKNOWN',
          primaryIntent: 'GENERAL_REASONING',
          confidence: 0.5,
          confidenceLevel: 'LOW_CONFIDENCE',
          reasoning: 'Unclassified user input falling back safely.',
          requiredContext: {
            conversation: true,
            memory: true,
            rag: false,
            project: false,
            workspace: false,
            tools: false,
            system: true,
          },
          entities,
        }),
      );
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new IntentFailedError(error instanceof Error ? error.message : String(error), cause),
      );
    }
  }

  // ─── Follow-Up Resolution ───────────────────────────────────────────────────

  private checkFollowUp(
    lower: string,
    raw: string,
    history: readonly any[],
    entities: readonly Entity[],
  ): Intent | null {
    // 1. Explicit continuation phrases
    if (
      lower.startsWith('actually,') ||
      lower.startsWith('also,') ||
      lower.startsWith('and ') ||
      lower === 'what should i do next?' ||
      lower === 'what should i do next' ||
      lower === 'what next?' ||
      lower === 'what next'
    ) {
      return this.buildIntent({
        type: 'FOLLOW_UP',
        primaryIntent: 'PLANNING_DECISION',
        secondaryIntent: 'FOLLOW_UP',
        confidence: 0.92,
        confidenceLevel: 'HIGH_CONFIDENCE',
        reasoning: 'Follow-up query refining or progressing the active conversation.',
        requiredContext: {
          conversation: true,
          memory: true,
          rag: false,
          project: true,
          workspace: true,
          tools: true,
          system: true,
        },
        entities,
      });
    }

    // 2. Short date/temporal responses when history is present
    if (
      history &&
      history.length > 0 &&
      (/^(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)/i.test(lower) ||
        lower.includes('the deadline changed') ||
        lower.includes('deadline is') ||
        lower.includes('changed to friday'))
    ) {
      return this.buildIntent({
        type: 'FOLLOW_UP',
        primaryIntent: 'PLANNING_DECISION',
        secondaryIntent: 'PROJECT_PLANNING',
        confidence: 0.9,
        confidenceLevel: 'HIGH_CONFIDENCE',
        reasoning: 'Contextual follow-up providing deadline or constraint parameter.',
        requiredContext: {
          conversation: true,
          memory: true,
          rag: false,
          project: true,
          workspace: true,
          tools: true,
          system: true,
        },
        entities,
      });
    }

    return null;
  }

  // ─── Ambiguity Detector ─────────────────────────────────────────────────────

  private checkAmbiguity(lower: string, entities: readonly Entity[]): Intent | null {
    if (lower.length <= 2) {
      return this.buildIntent({
        type: 'CLARIFICATION',
        primaryIntent: 'AMBIGUOUS',
        confidence: 0.3,
        confidenceLevel: 'LOW_CONFIDENCE',
        requiresClarification: true,
        clarificationPrompt:
          'Your message is very brief. How can I help you today? You can ask a question, manage tasks, or search documents.',
        reasoning: 'Query is too short to determine user intent.',
        requiredContext: {
          conversation: true,
          memory: false,
          rag: false,
          project: false,
          workspace: false,
          tools: false,
          system: false,
        },
        entities,
      });
    }

    if (lower === 'what' || lower === 'help' || lower === 'do it' || lower === 'fix this') {
      let prompt = 'Could you please provide more details on what you would like me to do?';
      if (lower === 'fix this') {
        prompt = 'Could you please specify which task, code, or item you would like me to fix?';
      } else if (lower === 'do it') {
        prompt = 'What specific action or task would you like me to perform?';
      } else if (lower === 'help') {
        prompt =
          'I can help you create tasks, organize projects, schedule automations, search documents, or answer questions. What would you like to do?';
      }

      return this.buildIntent({
        type: 'CLARIFICATION',
        primaryIntent: 'AMBIGUOUS',
        confidence: 0.35,
        confidenceLevel: 'LOW_CONFIDENCE',
        requiresClarification: true,
        clarificationPrompt: prompt,
        reasoning: `Query "${lower}" is underspecified and lacks an actionable target.`,
        requiredContext: {
          conversation: true,
          memory: false,
          rag: false,
          project: false,
          workspace: false,
          tools: false,
          system: false,
        },
        entities,
      });
    }

    return null;
  }

  // ─── Greetings Check ────────────────────────────────────────────────────────

  private isGreeting(lower: string): boolean {
    const greetings = [
      'hello',
      'hi',
      'hey',
      'hey aether',
      'hello aether',
      'hi aether',
      'good morning',
      'good afternoon',
      'good evening',
      'greetings',
      'howdy',
      'sup',
    ];

    if (greetings.includes(lower)) return true;
    return greetings.some((g) => {
      return (
        lower.startsWith(`${g} `) ||
        lower.startsWith(`${g},`) ||
        lower.startsWith(`${g}!`) ||
        lower.startsWith(`${g}.`)
      );
    });
  }

  // ─── Capabilities Check ─────────────────────────────────────────────────────

  private isCapabilities(lower: string): boolean {
    const capabilities = [
      'what can you do',
      'what can you help me with',
      'what can you help with',
      'how can you help',
      'what are your capabilities',
      'what features do you have',
      'what can aether do',
      'how can aether help',
    ];
    return capabilities.some((c) => lower.includes(c));
  }

  // ─── Entity Extraction ──────────────────────────────────────────────────────

  private extractEntities(raw: string, lower: string): readonly Entity[] {
    const entities: Entity[] = [];

    // Project references: e.g. "website project", "project Alpha"
    const projMatch = raw.match(
      /(?:website project|project\s+([a-zA-Z0-9_\-\s]{2,40})|in project\s+([a-zA-Z0-9_\-\s]{2,40}))/i,
    );
    if (projMatch) {
      const val = (projMatch[1] || projMatch[2] || projMatch[0]).trim();
      entities.push({
        type: 'project_name',
        value: val,
        confidence: 0.9,
      });
    }

    // Task title references
    const taskMatch = raw.match(/(?:create|add|new|complete|delete)\s+task\s+([^\n.,;]+)/i);
    if (taskMatch && taskMatch[1]) {
      const val = taskMatch[1].trim();
      if (val) {
        entities.push({
          type: 'task_title',
          value: val,
          confidence: 0.9,
        });
      }
    }

    // Priority expressions
    if (lower.includes('highest priority') || lower.includes('top priority')) {
      entities.push({
        type: 'priority',
        value: 'HIGH',
        confidence: 0.95,
      });
    }

    // Time / Deadline expressions
    const timeMatch = raw.match(
      /(?:every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|friday|tomorrow|today|next week)/i,
    );
    if (timeMatch && timeMatch[0]) {
      entities.push({
        type: 'schedule_expression',
        value: timeMatch[0].trim(),
        confidence: 0.9,
      });
    }

    return entities;
  }

  // ─── Helper Builder ─────────────────────────────────────────────────────────

  private buildIntent(params: {
    type: IntentType;
    primaryIntent?: IntentType;
    secondaryIntent?: IntentType;
    confidence: number;
    confidenceLevel?: ConfidenceLevel;
    reasoning?: string;
    requiresRAG?: boolean;
    requiresMemory?: boolean;
    requiresTool?: boolean;
    requiresAgent?: boolean;
    requiredContext?: RequiredContext;
    requestedAction?: string;
    requiresClarification?: boolean;
    clarificationPrompt?: string;
    entities?: readonly Entity[];
  }): Intent {
    const defaultConfidenceLevel: ConfidenceLevel =
      params.confidence >= 0.85
        ? 'HIGH_CONFIDENCE'
        : params.confidence >= 0.5
          ? 'MEDIUM_CONFIDENCE'
          : 'LOW_CONFIDENCE';

    return {
      type: params.type,
      primaryIntent: params.primaryIntent ?? params.type,
      secondaryIntent: params.secondaryIntent,
      confidence: params.confidence,
      confidenceLevel: params.confidenceLevel ?? defaultConfidenceLevel,
      reasoning: params.reasoning,
      requiresRAG: params.requiresRAG ?? false,
      requiresMemory: params.requiresMemory ?? false,
      requiresTool: params.requiresTool ?? false,
      requiresAgent: params.requiresAgent ?? false,
      requiredContext: params.requiredContext ?? {
        conversation: true,
        memory: params.requiresMemory ?? false,
        rag: params.requiresRAG ?? false,
        project: false,
        workspace: false,
        tools: params.requiresTool ?? false,
        system: false,
      },
      requestedAction: params.requestedAction,
      requiresClarification: params.requiresClarification ?? false,
      clarificationPrompt: params.clarificationPrompt,
      entities: params.entities ?? [],
    };
  }

  // ─── Calculation Check ──────────────────────────────────────────────────────

  private isCalculation(lower: string): boolean {
    const mathRegex =
      /^(?:what is |calculate |evaluate |solve )?\s*-?\d+(?:\.\d+)?\s*(?:[\+\-\*\/×÷]|plus|minus|times|multiplied by|divided by)\s*-?\d+(?:\.\d+)?\s*\??$/i;
    return mathRegex.test(lower.trim());
  }

  // ─── Task Type Classifier ───────────────────────────────────────────────────

  public classifyTaskType(intent: Intent, message: string = ''): AgentTaskType {
    const lower = message.toLowerCase();
    if (
      intent.requiresAgent ||
      intent.type === 'WEEKLY_PLANNING' ||
      intent.type === 'PROJECT_PLANNING' ||
      intent.type === 'AUTOMATION_REQUEST'
    ) {
      return intent.type === 'AUTOMATION_REQUEST' ? 'LONG_RUNNING' : 'MULTI_STEP';
    }
    if (
      intent.requiresTool ||
      intent.type === 'TASK_CREATION' ||
      intent.type === 'PROJECT_MANAGEMENT' ||
      intent.type === 'PROJECT_WORKSPACE_TASK'
    ) {
      return 'TOOL_REQUIRED';
    }
    if (
      intent.requiresMemory ||
      intent.requiresRAG ||
      intent.type === 'MEMORY_RECALL' ||
      intent.type === 'MEMORY_STORE' ||
      intent.type === 'KNOWLEDGE_REQUEST' ||
      intent.type === 'FOLLOW_UP' ||
      lower.includes('my project') ||
      lower.includes('our conversation')
    ) {
      return 'CONTEXTUAL';
    }
    if (
      intent.type === 'GREETING' ||
      intent.type === 'GENERAL_QUESTION' ||
      intent.type === 'INFORMATION_REQUEST' ||
      intent.type === 'CONVERSATIONAL'
    ) {
      return 'SIMPLE';
    }
    return 'SIMPLE';
  }
}

export { HeuristicIntentEngine as IntentEngine };
export const intentEngine = new HeuristicIntentEngine();
