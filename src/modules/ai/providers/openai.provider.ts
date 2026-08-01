import { IAiProvider, ChatMessage, CompletionOptions, ProviderResponse } from './provider.interface';

export class OpenAIProvider implements IAiProvider {
  public id = 'openai';
  public name = 'OpenAI Provider';

  public async generateCompletion(messages: ChatMessage[], options: CompletionOptions): Promise<ProviderResponse> {
    const promptText = messages.map((m) => m.content).join(' ');
    const estimatedPrompt = Math.ceil(promptText.length / 4);
    const simulatedResponse = `[OpenAI ${options.model}] Processed request with ${messages.length} messages.`;
    const estimatedCompletion = Math.ceil(simulatedResponse.length / 4);

    return {
      content: simulatedResponse,
      finishReason: 'stop',
      usage: {
        promptTokens: estimatedPrompt,
        completionTokens: estimatedCompletion,
        totalTokens: estimatedPrompt + estimatedCompletion,
      },
    };
  }

  public async generateStream(messages: ChatMessage[], options: CompletionOptions, onChunk: (chunk: string) => void): Promise<ProviderResponse> {
    const fullText = `[OpenAI ${options.model} Stream] Streamed completion output.`;
    const tokens = fullText.split(' ');

    for (const token of tokens) {
      onChunk(token + ' ');
      await new Promise((res) => setTimeout(res, 20));
    }

    return {
      content: fullText,
      finishReason: 'stop',
      usage: { promptTokens: 20, completionTokens: tokens.length, totalTokens: 20 + tokens.length },
    };
  }

  public async generateEmbeddings(text: string | string[]): Promise<number[][]> {
    const inputs = Array.isArray(text) ? text : [text];
    return inputs.map(() => Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
  }

  public async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }
}