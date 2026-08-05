import { OllamaProvider } from '../providers/ollama.provider';

export class ResearchAgent {
  private provider: OllamaProvider;

  constructor() {
    this.provider = new OllamaProvider();
  }

  public async research(topic: string): Promise<string> {
    const res = await this.provider.generateCompletion(
      [{ role: 'user', content: `Synthesize key facts for research topic: ${topic}` }],
      { model: 'llama3.1:8b' },
    );
    return res.content;
  }
}
