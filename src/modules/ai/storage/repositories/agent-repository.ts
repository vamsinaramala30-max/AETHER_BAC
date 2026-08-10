/**
 * AETHER AI — Agent Repository
 * Persistence layer for Agent Configurations and Execution Run Records. Pure persistence only.
 */

import type { AgentConfig, AgentStatus } from '../../agents/agent-types.js';

export interface AgentRunRecord {
  readonly id: string;
  readonly agentId: string;
  readonly userId: string;
  readonly status: AgentStatus;
  readonly inputPrompt: string;
  readonly outputResult?: string;
  readonly errorDetails?: string;
  readonly startedAt: number;
  readonly completedAt?: number;
}

export interface IAgentRepository {
  saveAgent(agent: AgentConfig): Promise<void>;
  getAgentById(id: string): Promise<AgentConfig | undefined>;
  listAgents(): Promise<readonly AgentConfig[]>;
  deleteAgent(id: string): Promise<boolean>;

  saveRun(run: AgentRunRecord): Promise<void>;
  getRunById(id: string): Promise<AgentRunRecord | undefined>;
  listRunsByAgent(agentId: string): Promise<readonly AgentRunRecord[]>;
}

export class AgentRepository implements IAgentRepository {
  private readonly agents = new Map<string, AgentConfig>();
  private readonly runs = new Map<string, AgentRunRecord>();

  public async saveAgent(agent: AgentConfig): Promise<void> {
    this.agents.set(agent.id, agent);
  }

  public async getAgentById(id: string): Promise<AgentConfig | undefined> {
    return this.agents.get(id);
  }

  public async listAgents(): Promise<readonly AgentConfig[]> {
    return Array.from(this.agents.values());
  }

  public async deleteAgent(id: string): Promise<boolean> {
    return this.agents.delete(id);
  }

  public async saveRun(run: AgentRunRecord): Promise<void> {
    this.runs.set(run.id, run);
  }

  public async getRunById(id: string): Promise<AgentRunRecord | undefined> {
    return this.runs.get(id);
  }

  public async listRunsByAgent(agentId: string): Promise<readonly AgentRunRecord[]> {
    const list: AgentRunRecord[] = [];
    for (const r of this.runs.values()) {
      if (r.agentId === agentId) {
        list.push(r);
      }
    }
    return list.sort((a, b) => b.startedAt - a.startedAt);
  }
}

export const agentRepository = new AgentRepository();
