import { GeminiProvider } from '../providers/gemini.provider';
import { SYSTEM_PROMPT } from '../prompts/system.prompt';
import { ChatMessage } from '../providers/provider.interface';

export class AssistantAgent {
  private provider: GeminiProvider;

  constructor() {
    this.provider = new GeminiProvider();
  }

  public async execute(prompt: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const response = await this.provider.generateCompletion(messages, {
      model: 'gemini',
      systemPrompt: SYSTEM_PROMPT,
    });

    return response.content;
  }
}
