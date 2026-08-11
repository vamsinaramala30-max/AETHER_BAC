/**
 * AETHER AI — Configuration
 * Central configuration for the AETHER AI module.
 * All values are validated at startup.
 */

import type { ModelId } from './ai-types.js';

// ─── Runtime Configuration ────────────────────────────────────────────────────

export type LLMRuntimeType = 'ollama' | 'llamacpp' | 'none';

export interface OllamaRuntimeConfig {
  readonly type: 'ollama';
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly keepAliveMs: number;
}

export interface LlamaCppRuntimeConfig {
  readonly type: 'llamacpp';
  readonly serverUrl: string;
  readonly timeoutMs: number;
}

export interface NoRuntimeConfig {
  readonly type: 'none';
}

export type LLMRuntimeConfig =
  | OllamaRuntimeConfig
  | LlamaCppRuntimeConfig
  | NoRuntimeConfig;

// ─── Model Configuration ──────────────────────────────────────────────────────

export interface ModelConfig {
  readonly defaultModelId: ModelId;
  readonly embeddingModelId: ModelId;
  readonly maxContextTokens: number;
  readonly defaultTemperature: number;
  readonly defaultMaxTokens: number;
  readonly defaultTopP: number;
  readonly defaultTimeoutMs: number;
}

// ─── Embedding Configuration ──────────────────────────────────────────────────

export type EmbeddingProviderType = 'ollama' | 'llamacpp' | 'none';

export interface EmbeddingConfig {
  readonly provider: EmbeddingProviderType;
  readonly modelId: ModelId;
  readonly dimensions: number;
  readonly batchSize: number;
  readonly cacheEnabled: boolean;
  readonly cacheTTLMs: number;
  readonly cacheMaxSize: number;
}

// ─── RAG Configuration ────────────────────────────────────────────────────────

export interface RAGConfig {
  readonly enabled: boolean;
  readonly maxDocuments: number;
  readonly maxChunkSizeTokens: number;
  readonly chunkOverlapTokens: number;
  readonly topK: number;
  readonly scoreThreshold: number;
  readonly hybridSearchAlpha: number;
  readonly rerankEnabled: boolean;
  readonly contextCompressionEnabled: boolean;
  readonly maxContextTokens: number;
}

// ─── Memory Configuration ─────────────────────────────────────────────────────

export interface MemoryConfig {
  readonly enabled: boolean;
  readonly conversationWindowSize: number;
  readonly workingMemoryTTLMs: number;
  readonly longTermMemoryMaxItems: number;
  readonly longTermMemoryScoreThreshold: number;
  readonly summarizationEnabled: boolean;
  readonly summarizationThreshold: number;
}

// ─── Safety Configuration ─────────────────────────────────────────────────────

export interface SafetyConfig {
  readonly enabled: boolean;
  readonly blockHarmfulContent: boolean;
  readonly blockPersonalInfo: boolean;
  readonly blockPromptInjection: boolean;
  readonly maxInputLength: number;
  readonly maxOutputLength: number;
}

// ─── Streaming Configuration ──────────────────────────────────────────────────

export interface StreamingConfig {
  readonly chunkDelayMs: number;
  readonly maxChunkSize: number;
  readonly heartbeatIntervalMs: number;
}

// ─── Provider Configuration ──────────────────────────────────────────────────

export interface ProvidersConfig {
  readonly primaryProvider: 'gemini' | 'openai' | 'ollama';
  readonly fallbackProvider: 'openai' | 'gemini' | 'ollama' | 'none';
  readonly geminiApiKey?: string;
  readonly openaiApiKey?: string;
  readonly localLlmBaseUrl: string;
  readonly localLlmModel: string;
  readonly localLlmTimeoutMs: number;
}

// ─── Full AI Configuration ────────────────────────────────────────────────────

export interface AIConfig {
  readonly providers: ProvidersConfig;
  readonly runtime: LLMRuntimeConfig;
  readonly model: ModelConfig;
  readonly embedding: EmbeddingConfig;
  readonly rag: RAGConfig;
  readonly memory: MemoryConfig;
  readonly safety: SafetyConfig;
  readonly streaming: StreamingConfig;
}

// ─── Default Configuration ────────────────────────────────────────────────────

export function buildDefaultAIConfig(overrides?: Partial<AIConfig>): AIConfig {
  const defaultConfig: AIConfig = {
    providers: {
      primaryProvider: (process.env['AI_PRIMARY_PROVIDER'] as any) || 'gemini',
      fallbackProvider: (process.env['AI_FALLBACK_PROVIDER'] as any) || 'openai',
      geminiApiKey: process.env['GEMINI_API_KEY'],
      openaiApiKey: process.env['OPENAI_API_KEY'],
      localLlmBaseUrl: process.env['LOCAL_LLM_BASE_URL'] ?? 'http://localhost:11434',
      localLlmModel: process.env['LOCAL_LLM_MODEL'] ?? 'llama3.2',
      localLlmTimeoutMs: Number(process.env['LOCAL_LLM_TIMEOUT']) || 120_000,
    },
    runtime: {
      type: 'ollama',
      baseUrl: process.env['LOCAL_LLM_BASE_URL'] ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
      timeoutMs: Number(process.env['LOCAL_LLM_TIMEOUT']) || 120_000,
      keepAliveMs: 300_000,
    },
    model: {
      defaultModelId: process.env['LOCAL_LLM_MODEL'] ?? process.env['AETHER_DEFAULT_MODEL'] ?? 'llama3.2',
      embeddingModelId: process.env['AETHER_EMBEDDING_MODEL'] ?? 'nomic-embed-text',
      maxContextTokens: 8192,
      defaultTemperature: 0.7,
      defaultMaxTokens: 2048,
      defaultTopP: 0.9,
      defaultTimeoutMs: Number(process.env['LOCAL_LLM_TIMEOUT']) || 120_000,
    },
    embedding: {
      provider: (process.env['AETHER_EMBEDDING_PROVIDER'] as EmbeddingProviderType) ?? 'ollama',
      modelId: process.env['AETHER_EMBEDDING_MODEL'] ?? 'nomic-embed-text',
      dimensions: 768,
      batchSize: 32,
      cacheEnabled: true,
      cacheTTLMs: 3_600_000,
      cacheMaxSize: 10_000,
    },
    rag: {
      enabled: true,
      maxDocuments: 50_000,
      maxChunkSizeTokens: 512,
      chunkOverlapTokens: 64,
      topK: 5,
      scoreThreshold: 0.5,
      hybridSearchAlpha: 0.5,
      rerankEnabled: false,
      contextCompressionEnabled: false,
      maxContextTokens: 4096,
    },
    memory: {
      enabled: true,
      conversationWindowSize: 20,
      workingMemoryTTLMs: 3_600_000,
      longTermMemoryMaxItems: 10_000,
      longTermMemoryScoreThreshold: 0.6,
      summarizationEnabled: true,
      summarizationThreshold: 30,
    },
    safety: {
      enabled: true,
      blockHarmfulContent: true,
      blockPersonalInfo: false,
      blockPromptInjection: true,
      maxInputLength: 32_768,
      maxOutputLength: 32_768,
    },
    streaming: {
      chunkDelayMs: 0,
      maxChunkSize: 256,
      heartbeatIntervalMs: 15_000,
    },
  };

  if (!overrides) return defaultConfig;

  return {
    providers: overrides.providers ? { ...defaultConfig.providers, ...overrides.providers } : defaultConfig.providers,
    runtime: overrides.runtime ?? defaultConfig.runtime,
    model: overrides.model ? { ...defaultConfig.model, ...overrides.model } : defaultConfig.model,
    embedding: overrides.embedding
      ? { ...defaultConfig.embedding, ...overrides.embedding }
      : defaultConfig.embedding,
    rag: overrides.rag ? { ...defaultConfig.rag, ...overrides.rag } : defaultConfig.rag,
    memory: overrides.memory
      ? { ...defaultConfig.memory, ...overrides.memory }
      : defaultConfig.memory,
    safety: overrides.safety
      ? { ...defaultConfig.safety, ...overrides.safety }
      : defaultConfig.safety,
    streaming: overrides.streaming
      ? { ...defaultConfig.streaming, ...overrides.streaming }
      : defaultConfig.streaming,
  };
}

// ─── Config Validation ────────────────────────────────────────────────────────

export interface ConfigValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function validateAIConfig(config: AIConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.model.maxContextTokens < 512) {
    errors.push('model.maxContextTokens must be at least 512');
  }
  if (config.model.defaultTemperature < 0 || config.model.defaultTemperature > 2) {
    errors.push('model.defaultTemperature must be between 0 and 2');
  }
  if (config.model.defaultMaxTokens < 1) {
    errors.push('model.defaultMaxTokens must be at least 1');
  }
  if (config.rag.topK < 1) {
    errors.push('rag.topK must be at least 1');
  }
  if (config.rag.scoreThreshold < 0 || config.rag.scoreThreshold > 1) {
    errors.push('rag.scoreThreshold must be between 0 and 1');
  }
  if (config.runtime.type === 'none') {
    warnings.push(
      'LLM runtime is set to "none". All generation requests will return MODEL_UNAVAILABLE.',
    );
  }
  if (config.embedding.provider === 'none') {
    warnings.push(
      'Embedding provider is set to "none". RAG and semantic memory search will be unavailable.',
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
