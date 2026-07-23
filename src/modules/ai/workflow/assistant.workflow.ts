import { AssistantAgent } from '../agents/assistant.agent';

export class AssistantWorkflow {
  private agent: AssistantAgent;

  constructor() {
    this.agent = new AssistantAgent();
  }

  public async run(query: string): Promise<string> {
    return this.agent.execute(query);
  }
}