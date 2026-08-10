/**
 * AETHER AI — Agent Registry
 * Registration and lookup for configured AI agents.
 */

import type { AgentConfig } from './agent-types.js';

export interface IAgentRegistry {
  register(agent: AgentConfig): void;
  unregister(id: string): boolean;
  get(id: string): AgentConfig | undefined;
  has(id: string): boolean;
  list(): readonly AgentConfig[];
  clear(): void;
}

export class AgentRegistry implements IAgentRegistry {
  private readonly agents = new Map<string, AgentConfig>();

  public register(agent: AgentConfig): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already registered.`);
    }
    this.agents.set(agent.id, agent);
  }

  public unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  public get(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  public has(id: string): boolean {
    return this.agents.has(id);
  }

  public list(): readonly AgentConfig[] {
    return Array.from(this.agents.values());
  }

  public clear(): void {
    this.agents.clear();
  }
}

export const agentRegistry = new AgentRegistry();
