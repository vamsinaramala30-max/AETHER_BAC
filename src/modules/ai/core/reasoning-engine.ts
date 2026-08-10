/**
 * AETHER AI — Reasoning Engine
 * Manages reasoning state and traces.
 * NEVER exposes private chain-of-thought.
 * Only exposes safe public statuses.
 */

import type { ReasoningStatus, ReasoningTrace } from '../ai-types.js';
import { REASONING } from '../ai-constants.js';
import { isSafeReasoningStatus } from '../prompts/reasoning-prompts.js';

// ─── IReasoningEngine Interface ───────────────────────────────────────────────

export interface IReasoningEngine {
  startReasoning(requestId: string): void;
  updateStatus(requestId: string, status: ReasoningStatus, description?: string): void;
  getPublicStatus(requestId: string): ReasoningStatus | undefined;
  getTrace(requestId: string): readonly ReasoningTrace[];
  endReasoning(requestId: string): void;
  clearExpired(maxAgeMs?: number): void;
}

// ─── Reasoning Engine Implementation ─────────────────────────────────────────

interface ReasoningSession {
  readonly requestId: string;
  currentStatus: ReasoningStatus;
  readonly traces: ReasoningTrace[];
  readonly startedAt: number;
  completedAt?: number;
}

export class ReasoningEngine implements IReasoningEngine {
  private readonly sessions = new Map<string, ReasoningSession>();

  public startReasoning(requestId: string): void {
    this.sessions.set(requestId, {
      requestId,
      currentStatus: 'thinking',
      traces: [
        {
          status: 'thinking',
          step: 0,
          description: 'Starting processing',
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
  ): void {
    const session = this.sessions.get(requestId);
    if (!session) return;

    // Validate status is a safe public status — never expose private reasoning
    if (!isSafeReasoningStatus(status)) return;

    session.currentStatus = status;
    session.traces.push({
      status,
      step: session.traces.length,
      description: description ?? status,
      timestamp: Date.now(),
    });

    if (status === 'completed' || status === 'failed') {
      session.completedAt = Date.now();
    }
  }

  /**
   * Returns ONLY the current public status — never internal reasoning details.
   */
  public getPublicStatus(requestId: string): ReasoningStatus | undefined {
    const session = this.sessions.get(requestId);
    if (!session) return undefined;
    return session.currentStatus;
  }

  /**
   * Returns the trace — only public status values, never private chain-of-thought.
   */
  public getTrace(requestId: string): readonly ReasoningTrace[] {
    const session = this.sessions.get(requestId);
    if (!session) return [];
    // Return only trace entries with safe public statuses
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
      if (session.completedAt && session.completedAt < cutoff) {
        this.sessions.delete(id);
      }
    }
  }
}
