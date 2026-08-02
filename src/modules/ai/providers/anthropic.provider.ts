import {
  IAiProvider,
  ChatMessage,
  CompletionOptions,
  ProviderResponse,
} from './provider.interface';

export class AnthropicProvider implements IAiProvider {
  public id = 'anthropic';
  public name = 'Anthropic Provider';

  public async generateCompletion(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    const content = `[Anthropic ${options.model}] Structured analytical response generated.`;
    return {
      content,
      finishReason: 'stop',
      usage: { promptTokens: 30, completionTokens: 45, totalTokens: 75 },
    };
  }

  public async generateStream(
    messages: ChatMessage[],
    options: CompletionOptions,
    onChunk: (chunk: string) => void,
  ): Promise<ProviderResponse> {
    const fullText = `[Anthropic ${options.model}] Streaming response text block.`;
    const tokens = fullText.split(' ');
    for (const token of tokens) {
      onChunk(token + ' ');
      await new Promise((r) => setTimeout(r, 25));
    }
    return {
      content: fullText,
      finishReason: 'stop',
      usage: { promptTokens: 30, completionTokens: tokens.length, totalTokens: 30 + tokens.length },
    };
  }

  public async generateEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    return inputs.map(() => Array.from({ length: 1024 }, () => Math.random() * 2 - 1));
  }

  public async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 3.5);
  }
}
