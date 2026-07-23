import { GeminiProvider } from '../providers/gemini.provider';

export class ResearchAgent {
  private provider: GeminiProvider;

  constructor() {
    this.provider = new GeminiProvider();
  }

  public async research(topic: string): Promise<string> {
    return this.provider.generateText(`Synthesize key facts for research topic: ${topic}`);
  }
}