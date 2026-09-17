/**
 * AETHER AI — Conversation Manager
 * Core management service for conversation lifecycles: create, list, get, rename, delete.
 * All operations are strictly user-scoped.
 */

import type {
  Conversation,
  CreateConversationRequest,
  UpdateConversationRequest,
} from './conversation-types.js';
import type {
  ConversationTurn,
  ConversationState,
  StructuredConversationTurnPayload,
  Intent,
  Entity,
} from '../ai-types.js';
import type { IConversationRepository } from '../storage/repositories/conversation-repository.js';
import { conversationRepository } from '../storage/repositories/conversation-repository.js';
import type { IMessageService } from './message-service.js';
import { messageService } from './message-service.js';

export interface IConversationManager {
  // ─── Lifecycle Operations ──────────────────────────────────────────────────
  createConversation(request: CreateConversationRequest): Promise<Conversation>;
  listConversations(userId: string): Promise<readonly Conversation[]>;
  getConversation(conversationId: string, userId: string): Promise<Conversation | undefined>;
  renameConversation(request: UpdateConversationRequest): Promise<Conversation | undefined>;
  deleteConversation(conversationId: string, userId: string): Promise<boolean>;

  // ─── Phase 14 Multi-Turn State & Turn Management ───────────────────────────
  recordTurn(
    conversationId: string,
    userMessage: string,
    intent: Intent,
    entities?: readonly Entity[],
    contextSummary?: Record<string, unknown>,
  ): ConversationTurn;
  completeTurn(conversationId: string, turnId: string, assistantMessage: string): void;
  getState(conversationId: string): ConversationState;
  setState(conversationId: string, state: ConversationState): void;
  getCurrentGoal(conversationId: string): string | null;
  setCurrentGoal(conversationId: string, goal: string | null): void;
  isFollowUp(conversationId: string, userMessage: string, intent?: Intent): boolean;
  buildStructuredTurnPayload(
    conversationId: string,
    turnId: string,
    userMessage: string,
    intent: Intent,
    conversationHistory: Array<{ role: string; content: string; turn_id?: string }>,
    entities?: Record<string, unknown>,
    context?: Record<string, unknown>,
    requiresClarification?: boolean,
    clarificationQuestion?: string | null,
  ): StructuredConversationTurnPayload;
  resetConversationState(conversationId: string): void;
  getTurns(conversationId: string): readonly ConversationTurn[];
}

export class ConversationManager implements IConversationManager {
  // In-memory runtime state for active conversations (user & session isolated)
  private readonly conversationStates = new Map<string, ConversationState>();
  private readonly currentGoals = new Map<string, string | null>();
  private readonly turnsMap = new Map<string, ConversationTurn[]>();
  private readonly entityStore = new Map<string, Map<string, unknown>>();

  constructor(
    private readonly repo: IConversationRepository = conversationRepository,
    private readonly msgService: IMessageService = messageService,
  ) {}

  public async createConversation(request: CreateConversationRequest): Promise<Conversation> {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const conv: Conversation = {
      id,
      userId: request.userId,
      title: request.title ?? 'New Conversation',
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      metadata: request.metadata,
    };

    this.conversationStates.set(id, 'IDLE');
    this.currentGoals.set(id, null);
    this.turnsMap.set(id, []);
    this.entityStore.set(id, new Map());

    await this.repo.save(conv);
    return conv;
  }

  public async listConversations(userId: string): Promise<readonly Conversation[]> {
    return this.repo.getByUser(userId);
  }

  public async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<Conversation | undefined> {
    return this.repo.getById(conversationId, userId);
  }

  public async renameConversation(
    request: UpdateConversationRequest,
  ): Promise<Conversation | undefined> {
    const existing = await this.repo.getById(request.conversationId, request.userId);
    if (!existing) return undefined;

    const updated: Conversation = {
      ...existing,
      title: request.title ?? existing.title,
      metadata: request.metadata
        ? { ...existing.metadata, ...request.metadata }
        : existing.metadata,
      updatedAt: Date.now(),
    };

    await this.repo.save(updated);
    return updated;
  }

  public async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const deleted = await this.repo.delete(conversationId, userId);
    if (deleted) {
      await this.msgService.deleteMessagesByConversation(conversationId, userId);
      this.resetConversationState(conversationId);
    }
    return deleted;
  }

  // ─── Phase 14 Multi-Turn State Tracking ─────────────────────────────────────

  public getState(conversationId: string): ConversationState {
    return this.conversationStates.get(conversationId) ?? 'IDLE';
  }

  public setState(conversationId: string, state: ConversationState): void {
    this.conversationStates.set(conversationId, state);
  }

  public getCurrentGoal(conversationId: string): string | null {
    return this.currentGoals.get(conversationId) ?? null;
  }

  public setCurrentGoal(conversationId: string, goal: string | null): void {
    this.currentGoals.set(conversationId, goal);
  }

  public getTurns(conversationId: string): readonly ConversationTurn[] {
    return this.turnsMap.get(conversationId) ?? [];
  }

  public recordTurn(
    conversationId: string,
    userMessage: string,
    intent: Intent,
    entities: readonly Entity[] = [],
    contextSummary: Record<string, unknown> = {},
  ): ConversationTurn {
    const turns = this.turnsMap.get(conversationId) ?? [];
    const turnNumber = turns.length + 1;
    const turnId = `turn_${conversationId}_${turnNumber}`;

    // Extract or update goal if user states one
    let currentGoal = this.getCurrentGoal(conversationId);
    const lower = userMessage.toLowerCase();
    if (
      lower.includes('website project') ||
      lower.includes('e-commerce') ||
      lower.includes('project is called') ||
      lower.includes('my project')
    ) {
      if (lower.includes('website')) currentGoal = 'Website Project';
      else if (lower.includes('e-commerce')) currentGoal = 'E-commerce Website';
      this.setCurrentGoal(conversationId, currentGoal);
    } else if (lower.includes('plan my week') || lower.includes('organize my tasks')) {
      currentGoal = 'Weekly Task Planning';
      this.setCurrentGoal(conversationId, currentGoal);
    }

    // Determine state
    let state = this.getState(conversationId);
    if (intent.requiresClarification) {
      state = 'AWAITING_CLARIFICATION';
    } else if (
      intent.type === 'WEEKLY_PLANNING' ||
      intent.type === 'PROJECT_PLANNING' ||
      intent.type === 'PLANNING'
    ) {
      state = 'ACTIVE_PLANNING';
    } else if (intent.type === 'FOLLOW_UP' || this.isFollowUp(conversationId, userMessage, intent)) {
      state = 'FOLLOW_UP';
    } else if (state === 'IDLE') {
      state = 'ACTIVE_CONVERSATION';
    }
    this.setState(conversationId, state);

    // Save extracted entities
    let store = this.entityStore.get(conversationId);
    if (!store) {
      store = new Map();
      this.entityStore.set(conversationId, store);
    }
    for (const ent of entities) {
      store.set(ent.type, ent.value);
    }

    const turn: ConversationTurn = {
      turnId,
      conversationId,
      turnNumber,
      userMessage,
      role: 'user',
      intent,
      goal: currentGoal,
      state,
      entities,
      contextSummary,
      timestamp: Date.now(),
    };

    turns.push(turn);
    this.turnsMap.set(conversationId, turns);
    return turn;
  }

  public completeTurn(conversationId: string, turnId: string, assistantMessage: string): void {
    const turns = this.turnsMap.get(conversationId);
    if (!turns) return;
    const turnIndex = turns.findIndex((t) => t.turnId === turnId);
    if (turnIndex >= 0) {
      const turn = turns[turnIndex];
      if (turn) {
        turns[turnIndex] = {
          ...turn,
          assistantMessage,
          assistantResponse: assistantMessage,
        };
      }
    }
  }

  /**
   * Distinguishes follow-up responses from independent new queries.
   */
  public isFollowUp(conversationId: string, userMessage: string, intent?: Intent): boolean {
    const turns = this.turnsMap.get(conversationId) ?? [];
    if (turns.length === 0) return false;

    const lastTurn = turns[turns.length - 1];
    if (!lastTurn) return false;

    const trimmed = userMessage.trim();
    const lower = trimmed.toLowerCase();

    // 1. If previous turn was awaiting clarification or in active planning
    if (
      lastTurn.state === 'AWAITING_CLARIFICATION' ||
      lastTurn.state === 'ACTIVE_PLANNING' ||
      lastTurn.intent.requiresClarification
    ) {
      // Short responses, temporal updates, or continuations
      if (
        /^(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)/i.test(lower) ||
        lower.startsWith('actually,') ||
        lower.startsWith('also,') ||
        lower.startsWith('and ') ||
        lower.startsWith('my priority is') ||
        lower.includes('the deadline changed') ||
        lower.includes('deadline is') ||
        lower.includes('what should i do next') ||
        lower.includes('what is my highest priority') ||
        trimmed.split(/\s+/).length <= 4
      ) {
        return true;
      }
    }

    // 2. Anaphoric references or continuation phrases
    if (
      lower.startsWith('actually,') ||
      lower.startsWith('what about') ||
      lower.startsWith('what next') ||
      lower.startsWith('what should i do next') ||
      lower.startsWith('how about') ||
      lower.includes('the deadline changed') ||
      lower.includes('changed to')
    ) {
      return true;
    }

    // 3. If intent is explicitly FOLLOW_UP
    if (intent?.type === 'FOLLOW_UP') {
      return true;
    }

    return false;
  }

  /**
   * Prepares the structured input contract for downstream components (Prompt Section 4).
   */
  public buildStructuredTurnPayload(
    conversationId: string,
    turnId: string,
    userMessage: string,
    intent: Intent,
    conversationHistory: Array<{ role: string; content: string; turn_id?: string }>,
    entities: Record<string, unknown> = {},
    context: Record<string, unknown> = {},
    requiresClarification = false,
    clarificationQuestion: string | null = null,
  ): StructuredConversationTurnPayload {
    const currentGoal = this.getCurrentGoal(conversationId);
    const state = this.getState(conversationId);
    return {
      conversation_id: conversationId,
      turn_id: turnId,
      turnId,
      user_message: userMessage,
      conversation_history: conversationHistory,
      current_goal: currentGoal,
      userGoal: currentGoal,
      state,
      intent: intent.type,
      entities,
      context,
      requires_clarification: requiresClarification || intent.requiresClarification === true,
      clarification_question: clarificationQuestion || intent.clarificationPrompt || null,
    };
  }

  public resetConversationState(conversationId: string): void {
    this.conversationStates.delete(conversationId);
    this.currentGoals.delete(conversationId);
    this.turnsMap.delete(conversationId);
    this.entityStore.delete(conversationId);
  }
}

export const conversationManager = new ConversationManager();

