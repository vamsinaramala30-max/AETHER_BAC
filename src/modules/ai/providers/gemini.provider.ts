import { IAiProvider, ChatMessage, CompletionOptions, ProviderResponse } from './provider.interface';

export class GeminiProvider implements IAiProvider {
  public id = 'gemini';
  public name = 'Google Gemini Provider';

  public async generateCompletion(messages: ChatMessage[], options: CompletionOptions): Promise<ProviderResponse> {
    const content = `[Gemini ${options.model}] Generated multi-modal context response.`;
    return {
      content,
      finishReason: 'stop',
      usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    };
  }

  public async generateStream(messages: ChatMessage[], options: CompletionOptions, onChunk: (chunk: string) => void): Promise<ProviderResponse> {
    const fullText = `[Gemini ${options.model}] Multi-modal streaming response complete.`;
    const chunks = fullText.split(' ');
    for (const chunk of chunks) {
      onChunk(chunk + ' ');
      await new Promise((r) => setTimeout(r, 15));
    }
    return {
      content: fullText,
      finishReason: 'stop',
      usage: { promptTokens: 15, completionTokens: chunks.length, totalTokens: 15 + chunks.length },
    };
  }

  public async generateEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    return inputs.map(() => Array.from({ length: 768 }, () => Math.random() * 2 - 1));
  }

  public async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 3.8);
  }
}