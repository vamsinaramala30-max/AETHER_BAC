import {
  IAiProvider,
  ChatMessage,
  CompletionOptions,
  ProviderResponse,
} from './provider.interface';

export class GeminiProvider implements IAiProvider {
  public id = 'gemini';
  public name = 'Google Gemini Provider';

  private apiKey?: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && !this.apiKey.includes('your-'));
  }

  public async generateCompletion(
    _messages: ChatMessage[],
    _options: CompletionOptions,
  ): Promise<ProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error('Provider not configured.');
    }
    throw new Error('Gemini provider integration disabled until valid API key configured.');
  }

  public async generateStream(
    _messages: ChatMessage[],
    _options: CompletionOptions,
    _onChunk: (chunk: string) => void,
  ): Promise<ProviderResponse> {
    if (!this.isConfigured()) {
      throw new Error('Provider not configured.');
    }
    throw new Error('Gemini provider integration disabled until valid API key configured.');
  }

  public async generateEmbeddings(_text: string | string[]): Promise<number[][]> {
    if (!this.isConfigured()) {
      throw new Error('Provider not configured.');
    }
    return [];
  }

  public async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }
}
