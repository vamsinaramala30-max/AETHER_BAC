import { GeminiProvider } from '../providers/gemini.provider';

export class EmbeddingService {
  private provider: GeminiProvider;

  constructor() {
    this.provider = new GeminiProvider();
  }

  public async getEmbedding(text: string): Promise<number[]> {
    return this.provider.generateEmbeddings(text);
  }
}
