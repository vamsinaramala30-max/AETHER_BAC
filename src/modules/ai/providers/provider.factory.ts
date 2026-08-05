import { IAiProvider } from './provider.interface';
import { OllamaProvider } from './ollama.provider';
import { OpenAIProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';
import { AnthropicProvider } from './anthropic.provider';

export class ProviderFactory {
  private providers: Map<string, IAiProvider> = new Map();
  private defaultProviderId = 'ollama';

  constructor() {
    this.registerProvider(new OllamaProvider());
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new AnthropicProvider());
  }

  public registerProvider(provider: IAiProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  public getProvider(providerId?: string): IAiProvider {
    const id = (providerId || this.defaultProviderId).toLowerCase();
    const provider = this.providers.get(id);
    if (!provider) {
      // Fallback to Ollama if requested provider is unknown
      return this.providers.get('ollama')!;
    }
    return provider;
  }

  public getOllamaProvider(): OllamaProvider {
    return this.providers.get('ollama') as OllamaProvider;
  }

  public listProviders(): Array<{ id: string; name: string; isDefault: boolean }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.id === this.defaultProviderId,
    }));
  }
}
