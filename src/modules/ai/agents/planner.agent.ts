import { OllamaProvider } from '../providers/ollama.provider';
import { PLANNER_PROMPT } from '../prompts/planner.prompt';

export class PlannerAgent {
  private provider: OllamaProvider;

  constructor() {
    this.provider = new OllamaProvider();
  }

  public async plan(task: string): Promise<string> {
    const res = await this.provider.generateCompletion(
      [{ role: 'user', content: `${PLANNER_PROMPT}\nTask: ${task}` }],
      { model: 'llama3.1:8b' },
    );
    return res.content;
  }
}
