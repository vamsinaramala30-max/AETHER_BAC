/**
 * AETHER AI — Provider Interface
 * Standard abstraction implemented by all LLM providers (Gemini, OpenAI, Ollama).
 */

import type { Result } from '../../ai-types.js';
import type {
  GenerationRequest,
  StreamingGenerationRequest,
  GenerationResponse,
  LLMStreamingChunk,
} from '../llm-types.js';

export type ProviderName = 'aether' | 'gemini' | 'openai' | 'ollama';

export type ProviderStatusState =
  'available' | 'unavailable' | 'rate_limited' | 'timeout' | 'config_error';

export interface ProviderStatus {
  readonly name: ProviderName;
  readonly status: ProviderStatusState;
  readonly message?: string;
  readonly checkedAt: number;
}

export interface ILLMProvider {
  readonly name: ProviderName;
  healthCheck(): Promise<ProviderStatus>;
  generate(request: GenerationRequest): Promise<Result<GenerationResponse>>;
  generateStream(
    request: StreamingGenerationRequest,
    onChunk: (chunk: LLMStreamingChunk) => void,
  ): Promise<Result<void>>;
}
