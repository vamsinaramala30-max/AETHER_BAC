/**
 * AETHER AI — Agent State Tracker
 * Manages agent status transitions and iteration safety to prevent infinite loops.
 */

import type { AgentStatus } from './agent-types.js';

export interface StateTransitionEvent {
  readonly from: AgentStatus;
  readonly to: AgentStatus;
  readonly reason: string;
  readonly timestamp: number;
}

export interface IAgentStateTracker {
  getStatus(): AgentStatus;
  getMessage(): string;
  getIteration(): number;
  getMaxIterations(): number;
  transitionTo(to: AgentStatus, reason: string): boolean;
  incrementIteration(): boolean;
  getHistory(): readonly StateTransitionEvent[];
}

export class AgentStateTracker implements IAgentStateTracker {
  private currentStatus: AgentStatus = 'idle';
  private currentMessage = 'Agent initialized';
  private iteration = 0;
  private readonly history: StateTransitionEvent[] = [];

  constructor(private readonly maxIterations: number = 10) {}

  public getStatus(): AgentStatus {
    return this.currentStatus;
  }

  public getMessage(): string {
    return this.currentMessage;
  }

  public getIteration(): number {
    return this.iteration;
  }

  public getMaxIterations(): number {
    return this.maxIterations;
  }

  public transitionTo(to: AgentStatus, reason: string): boolean {
    const from = this.currentStatus;
    if (from === 'completed' || from === 'failed' || from === 'cancelled') {
      return false; // Terminal states cannot transition further
    }

    this.currentStatus = to;
    this.currentMessage = reason;
    this.history.push({
      from,
      to,
      reason,
      timestamp: Date.now(),
    });
    return true;
  }

  public incrementIteration(): boolean {
    this.iteration += 1;
    if (this.iteration > this.maxIterations) {
      this.transitionTo('failed', `Maximum iterations (${this.maxIterations}) exceeded.`);
      return false;
    }
    return true;
  }

  public getHistory(): readonly StateTransitionEvent[] {
    return [...this.history];
  }
}
