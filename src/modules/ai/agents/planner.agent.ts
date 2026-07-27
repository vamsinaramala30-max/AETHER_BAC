import { GeminiProvider } from '../providers/gemini.provider';
import { PLANNER_PROMPT } from '../prompts/planner.prompt';

export class PlannerAgent {
  private provider: GeminiProvider;

  constructor() {
    this.provider = new GeminiProvider();
  }

  public async plan(task: string): Promise<string> {
    return this.provider.generateText(`${PLANNER_PROMPT}\nTask: ${task}`);
  }
}
