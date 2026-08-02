import { IAiProvider } from './provider.interface';
import { OpenAIProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';
import { AnthropicProvider } from './anthropic.provider';

export class ProviderFactory {
  private providers: Map<string, IAiProvider> = new Map();

  constructor() {
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new AnthropicProvider());
  }

  public registerProvider(provider: IAiProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  public getProvider(providerId: string): IAiProvider {
    const provider = this.providers.get(providerId.toLowerCase());
    if (!provider) {
      throw new Error(`AI Provider '${providerId}' is not supported or registered.`);
    }
    return provider;
  }

  public listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
