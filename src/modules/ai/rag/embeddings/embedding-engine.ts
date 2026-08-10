/**
 * AETHER AI — Embedding Engine
 * Provider-independent embedding interface and orchestration.
 * Does NOT use cloud embedding APIs.
 * Supports local/self-hosted embedding models via IEmbeddingModel.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { EmbeddingFailedError, NotConfiguredError } from '../../ai-errors.js';
import type { IEmbeddingModel } from './embedding-model.js';
import { EmbeddingCache } from './embedding-cache.js';
import type { EmbeddingConfig } from '../../ai-config.js';
import { EMBEDDING } from '../../ai-constants.js';

// ─── IEmbeddingEngine Interface ───────────────────────────────────────────────

export interface IEmbeddingEngine {
  embed(text: string): Promise<Result<readonly number[]>>;
  embedBatch(texts: readonly string[]): Promise<Result<readonly (readonly number[])[]>>;
  getDimensions(): number;
  isAvailable(): Promise<boolean>;
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Embedding Engine Implementation ─────────────────────────────────────────

export class EmbeddingEngine implements IEmbeddingEngine {
  private readonly cache: EmbeddingCache | null;
  private readonly model: IEmbeddingModel;
  private readonly dimensions: number;

  constructor(model: IEmbeddingModel, config: EmbeddingConfig) {
    this.model = model;
    this.dimensions = config.dimensions;
    this.cache = config.cacheEnabled
      ? new EmbeddingCache(config.cacheMaxSize, config.cacheTTLMs)
      : null;
  }

  public async embed(text: string): Promise<Result<readonly number[]>> {
    if (!text || text.trim().length === 0) {
      return fail(new EmbeddingFailedError('Input text is empty'));
    }

    const cacheKey = text;
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return ok(cached);
    }

    const result = await this.model.embed(text);
    if (!result.ok) return result;

    if (this.cache) {
      this.cache.set(cacheKey, result.value);
    }

    return ok(result.value);
  }

  public async embedBatch(
    texts: readonly string[],
  ): Promise<Result<readonly (readonly number[])[]>> {
    if (texts.length === 0) return ok([]);

    const results: (readonly number[])[] = [];
    const uncachedTexts: Array<{ text: string; index: number }> = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      if (this.cache) {
        const cached = this.cache.get(text);
        if (cached) {
          results[i] = cached;
          continue;
        }
      }
      uncachedTexts.push({ text, index: i });
    }

    // Embed uncached texts in batches
    if (uncachedTexts.length > 0) {
      const batchResult = await this.model.embedBatch(
        uncachedTexts.map((u) => u.text),
      );
      if (!batchResult.ok) return batchResult;

      for (let j = 0; j < uncachedTexts.length; j++) {
        const { text, index } = uncachedTexts[j]!;
        const embedding = batchResult.value[j]!;
        results[index] = embedding;
        if (this.cache) {
          this.cache.set(text, embedding);
        }
      }
    }

    // Verify all slots are filled
    for (let i = 0; i < texts.length; i++) {
      if (!results[i]) {
        return fail(new EmbeddingFailedError(`Missing embedding for index ${i}`));
      }
    }

    return ok(results);
  }

  public getDimensions(): number {
    return this.dimensions;
  }

  public async isAvailable(): Promise<boolean> {
    return this.model.isAvailable();
  }
}

// ─── Unavailable Embedding Engine ────────────────────────────────────────────

export class UnavailableEmbeddingEngine implements IEmbeddingEngine {
  public async embed(_text: string): Promise<Result<readonly number[]>> {
    return fail(
      new NotConfiguredError('Embedding engine is not configured. Set AETHER_EMBEDDING_PROVIDER.'),
    );
  }

  public async embedBatch(
    _texts: readonly string[],
  ): Promise<Result<readonly (readonly number[])[]>> {
    return fail(
      new NotConfiguredError('Embedding engine is not configured. Set AETHER_EMBEDDING_PROVIDER.'),
    );
  }

  public getDimensions(): number {
    return EMBEDDING.DEFAULT_DIMENSIONS;
  }

  public async isAvailable(): Promise<boolean> {
    return false;
  }
}
