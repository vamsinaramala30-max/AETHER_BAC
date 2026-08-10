/**
 * AETHER AI — Agent Memory
 * Maintains short-term observations and step history during execution.
 * Filters out private chain-of-thought when returning summaries.
 */

import type { PlanStep, AgentObservation } from './agent-types.js';

export interface IAgentMemory {
  recordStep(step: PlanStep): void;
  recordObservation(observation: AgentObservation): void;
  setFinalResponse(response: string): void;
  getSteps(): readonly PlanStep[];
  getObservations(): readonly AgentObservation[];
  getSummary(): string;
}

export class AgentShortTermMemory implements IAgentMemory {
  private readonly steps: PlanStep[] = [];
  private readonly observations: AgentObservation[] = [];
  private finalResponse?: string;

  public recordStep(step: PlanStep): void {
    this.steps.push(step);
  }

  public recordObservation(observation: AgentObservation): void {
    this.observations.push(observation);
  }

  public setFinalResponse(response: string): void {
    this.finalResponse = response;
  }

  public getSteps(): readonly PlanStep[] {
    return [...this.steps];
  }

  public getObservations(): readonly AgentObservation[] {
    return [...this.observations];
  }

  /**
   * Generates a clean summary without private chain-of-thought details.
   */
  public getSummary(): string {
    if (this.finalResponse) {
      return this.finalResponse;
    }

    const completedCount = this.steps.filter((s) => s.status === 'completed').length;
    return `Executed ${completedCount} of ${this.steps.length} planned steps.`;
  }
}
