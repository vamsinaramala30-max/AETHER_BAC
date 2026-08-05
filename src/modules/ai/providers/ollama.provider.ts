import { IAiProvider, ChatMessage, CompletionOptions, ProviderResponse } from './provider.interface';

export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaProvider implements IAiProvider {
  public id = 'ollama';
  public name = 'Ollama';
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async getModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Ollama models: ${response.statusText}`);
      }

      const data = (await response.json()) as { models?: OllamaModelInfo[] };
      return data.models || [];
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ECONNREFUSED') {
        throw new Error('Ollama is not running. Start the Ollama service and try again.');
      }
      throw error;
    }
  }

  public async generateCompletion(
    messages: ChatMessage[],
    options: CompletionOptions,
  ): Promise<ProviderResponse> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Ollama is not running. Start the Ollama service and try again.');
    }

    const installedModels = await this.getModels();
    const modelExists = installedModels.some(
      (m) => m.name === options.model || m.name.startsWith(options.model + ':'),
    );

    if (installedModels.length > 0 && !modelExists) {
      // Fallback to first available model if requested is missing, or inform user
      const availableNames = installedModels.map((m) => m.name).join(', ');
      throw new Error(`Model '${options.model}' not installed. Installed models: ${availableNames}`);
    }

    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (options.systemPrompt && !formattedMessages.some((m) => m.role === 'system')) {
      formattedMessages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const payload = {
      model: options.model,
      messages: formattedMessages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama Chat Error (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as any;
      const content = data.message?.content || '';
      const promptTokens = data.prompt_eval_count || 0;
      const completionTokens = data.eval_count || 0;

      return {
        content,
        finishReason: 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Ollama request timed out after 60 seconds.');
      }
      throw error;
    }
  }

  public async generateStream(
    messages: ChatMessage[],
    options: CompletionOptions,
    onChunk: (chunk: string) => void,
  ): Promise<ProviderResponse> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Ollama is not running. Start the Ollama service and try again.');
    }

    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (options.systemPrompt && !formattedMessages.some((m) => m.role === 'system')) {
      formattedMessages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const payload = {
      model: options.model,
      messages: formattedMessages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      throw new Error(`Ollama Stream Error (${response.status}): ${errText}`);
    }

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            const chunk = parsed.message.content;
            fullContent += chunk;
            onChunk(chunk);
          }
          if (parsed.done) {
            promptTokens = parsed.prompt_eval_count || 0;
            completionTokens = parsed.eval_count || 0;
          }
        } catch {
          // ignore chunk JSON parse errors
        }
      }
    }

    return {
      content: fullContent,
      finishReason: 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  public async generateEmbeddings(text: string | string[], model?: string): Promise<number[][]> {
    const texts = Array.isArray(text) ? text : [text];
    const targetModel = model || 'nomic-embed-text';
    const results: number[][] = [];

    for (const t of texts) {
      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: targetModel, prompt: t }),
        });
        if (!response.ok) {
          throw new Error(`Embeddings failed: ${response.statusText}`);
        }
        const data = (await response.json()) as any;
        results.push(data.embedding || []);
      } catch {
        results.push([]);
      }
    }

    return results;
  }

  public async countTokens(text: string): Promise<number> {
    // Approximate token count: 1 token ~= 4 chars
    return Math.ceil(text.length / 4);
  }
}
