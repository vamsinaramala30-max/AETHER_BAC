/**
 * AETHER AI — Multi-Provider Manager
 * Manages Gemini, OpenAI, and Ollama providers with intelligent fallback.
 */

import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import {
  ProviderUnavailableError,
  isRecoverableProviderError,
  toAetherAIError,
  AetherAIError,
} from '../ai-errors.js';
import type { AIConfig } from '../ai-config.js';
import type {
  GenerationRequest,
  StreamingGenerationRequest,
  GenerationResponse,
  LLMStreamingChunk,
} from './llm-types.js';
import type { ILLMProvider, ProviderName, ProviderStatus } from './providers/provider-interface.js';
import { GeminiProvider } from './providers/gemini-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { OllamaProvider } from './providers/ollama-provider.js';

export type ProviderMode = 'auto' | 'gemini' | 'openai' | 'ollama';

export interface ProviderExecutionResult<T> {
  readonly result: Result<T>;
  readonly activeProvider: ProviderName;
  readonly usedFallback: boolean;
  readonly fallbackReason?: string;
}

export class ProviderManager {
  private geminiProvider?: GeminiProvider;
  private openAIProvider?: OpenAIProvider;
  private ollamaProvider?: OllamaProvider;

  constructor(private readonly config: AIConfig) {}

  public getProvider(name: ProviderName): ILLMProvider {
    switch (name) {
      case 'gemini':
        if (!this.geminiProvider) {
          this.geminiProvider = new GeminiProvider(
            this.config.providers.geminiApiKey,
            'gemini-1.5-flash',
            this.config.model.defaultTimeoutMs,
          );
        }
        return this.geminiProvider;
      case 'openai':
        if (!this.openAIProvider) {
          this.openAIProvider = new OpenAIProvider(
            this.config.providers.openaiApiKey,
            'gpt-4o-mini',
            this.config.model.defaultTimeoutMs,
          );
        }
        return this.openAIProvider;
      case 'ollama':
        if (!this.ollamaProvider) {
          this.ollamaProvider = new OllamaProvider(
            this.config.providers.localLlmBaseUrl,
            this.config.providers.localLlmModel,
            this.config.providers.localLlmTimeoutMs,
          );
        }
        return this.ollamaProvider;
    }
  }

  public async getAllProviderStatuses(): Promise<Record<ProviderName, ProviderStatus>> {
    const gemini = await this.getProvider('gemini').healthCheck();
    const openai = await this.getProvider('openai').healthCheck();
    const ollama = await this.getProvider('ollama').healthCheck();

    return { gemini, openai, ollama };
  }

  public async generate(
    request: GenerationRequest,
    mode: ProviderMode = 'auto',
  ): Promise<ProviderExecutionResult<GenerationResponse>> {
    if (mode !== 'auto') {
      const provider = this.getProvider(mode);
      const res = await provider.generate(request);
      return {
        result: res,
        activeProvider: mode,
        usedFallback: false,
      };
    }

    // Auto Mode: Primary (Gemini) -> Fallback (OpenAI) -> Local (Ollama)
    const primaryName = this.config.providers.primaryProvider || 'gemini';
    const fallbackName = this.config.providers.fallbackProvider || 'openai';

    const primaryProvider = this.getProvider(primaryName);
    const primaryRes = await primaryProvider.generate(request);

    if (primaryRes.ok) {
      return {
        result: primaryRes,
        activeProvider: primaryName,
        usedFallback: false,
      };
    }

    // Check if error warrants fallback
    if (!isRecoverableProviderError(primaryRes.error)) {
      return {
        result: primaryRes,
        activeProvider: primaryName,
        usedFallback: false,
      };
    }

    const fallbackReason = `${primaryName} failed (${primaryRes.error.code}: ${primaryRes.error.message})`;

    // Execute secondary provider (OpenAI)
    if (fallbackName !== 'none' && fallbackName !== primaryName) {
      const fallbackProvider = this.getProvider(fallbackName);
      const fallbackRes = await fallbackProvider.generate(request);

      if (fallbackRes.ok) {
        return {
          result: fallbackRes,
          activeProvider: fallbackName,
          usedFallback: true,
          fallbackReason,
        };
      }

      // Check optional Ollama fallback if configured
      if (fallbackName !== 'ollama' && primaryName !== 'ollama') {
        const ollamaProvider = this.getProvider('ollama');
        const ollamaStatus = await ollamaProvider.healthCheck();
        if (ollamaStatus.status === 'available') {
          const ollamaRes = await ollamaProvider.generate(request);
          if (ollamaRes.ok) {
            return {
              result: ollamaRes,
              activeProvider: 'ollama',
              usedFallback: true,
              fallbackReason: `${fallbackReason} & ${fallbackName} failed`,
            };
          }
        }
      }
    }

    // Both providers failed: return clear error
    const finalError = new ProviderUnavailableError(
      primaryName,
      `Primary (${primaryName}) and Fallback (${fallbackName}) both failed. ${fallbackReason}`,
    );

    return {
      result: fail(finalError),
      activeProvider: primaryName,
      usedFallback: false,
      fallbackReason,
    };
  }

  public async generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
    mode: ProviderMode = 'auto',
  ): Promise<ProviderExecutionResult<void>> {
    if (mode !== 'auto') {
      const provider = this.getProvider(mode);
      const res = await provider.generateStream(request, onChunk);
      return {
        result: res,
        activeProvider: mode,
        usedFallback: false,
      };
    }

    // Auto Mode: Primary (Gemini) -> Fallback (OpenAI) -> Local (Ollama)
    const primaryName = this.config.providers.primaryProvider || 'gemini';
    const fallbackName = this.config.providers.fallbackProvider || 'openai';

    let chunkCount = 0;
    const trackingChunkHandler = (chunk: LLMStreamingChunk) => {
      chunkCount++;
      onChunk(chunk);
    };

    const primaryProvider = this.getProvider(primaryName);
    const primaryRes = await primaryProvider.generateStream(request, trackingChunkHandler);

    if (primaryRes.ok) {
      return {
        result: primaryRes,
        activeProvider: primaryName,
        usedFallback: false,
      };
    }

    // If primary failed AFTER emitting chunks, do NOT fallback to prevent duplicate partial messages
    if (chunkCount > 0) {
      return {
        result: primaryRes,
        activeProvider: primaryName,
        usedFallback: false,
      };
    }

    if (!isRecoverableProviderError(primaryRes.error)) {
      return {
        result: primaryRes,
        activeProvider: primaryName,
        usedFallback: false,
      };
    }

    const fallbackReason = `${primaryName} failed (${primaryRes.error.code}: ${primaryRes.error.message})`;

    // Fallback to OpenAI
    if (fallbackName !== 'none' && fallbackName !== primaryName) {
      const fallbackProvider = this.getProvider(fallbackName);
      const fallbackRes = await fallbackProvider.generateStream(request, onChunk);

      if (fallbackRes.ok) {
        return {
          result: fallbackRes,
          activeProvider: fallbackName,
          usedFallback: true,
          fallbackReason,
        };
      }

      // Check optional Ollama
      if (fallbackName !== 'ollama' && primaryName !== 'ollama') {
        const ollamaProvider = this.getProvider('ollama');
        const ollamaStatus = await ollamaProvider.healthCheck();
        if (ollamaStatus.status === 'available') {
          const ollamaRes = await ollamaProvider.generateStream(request, onChunk);
          if (ollamaRes.ok) {
            return {
              result: ollamaRes,
              activeProvider: 'ollama',
              usedFallback: true,
              fallbackReason: `${fallbackReason} & ${fallbackName} failed`,
            };
          }
        }
      }
    }

    const finalError = new ProviderUnavailableError(
      primaryName,
      `Primary (${primaryName}) and Fallback (${fallbackName}) both failed. ${fallbackReason}`,
    );

    return {
      result: fail(finalError),
      activeProvider: primaryName,
      usedFallback: false,
      fallbackReason,
    };
  }
}
