import { GeminiProvider } from '../providers/gemini.provider';
import { SYSTEM_PROMPT } from '../prompts/system.prompt';

export class AssistantAgent {
  private provider: GeminiProvider;

  constructor() {
    this.provider = new GeminiProvider();
  }

  public async execute(prompt: string): Promise<string> {
    return this.provider.generateText(prompt, { systemInstruction: SYSTEM_PROMPT });
  }
}
