/**
 * AETHER AI — Embedding Model
 * Local embedding model abstraction.
 * Does NOT use cloud embedding APIs.
 * Supports Ollama and llama.cpp embedding endpoints.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { EmbeddingFailedError } from '../../ai-errors.js';
import type { EmbeddingConfig } from '../../ai-config.js';
import { EMBEDDING } from '../../ai-constants.js';

// ─── IEmbeddingModel Interface ────────────────────────────────────────────────

export interface IEmbeddingModel {
  embed(text: string): Promise<Result<readonly number[]>>;
  embedBatch(texts: readonly string[]): Promise<Result<readonly (readonly number[])[]>>;
  getDimensions(): number;
  isAvailable(): Promise<boolean>;
}

// ─── Ollama Embedding Model ───────────────────────────────────────────────────

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export class OllamaEmbeddingModel implements IEmbeddingModel {
  private readonly baseUrl: string;
  private readonly modelId: string;
  private readonly dimensions: number;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, modelId: string, dimensions: number, timeoutMs = 30_000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.modelId = modelId;
    this.dimensions = dimensions;
    this.timeoutMs = timeoutMs;
  }

  public async embed(text: string): Promise<Result<readonly number[]>> {
    const result = await this.embedBatch([text]);
    if (!result.ok) return result;
    const embedding = result.value[0];
    if (!embedding) {
      return fail(new EmbeddingFailedError('Ollama returned empty embeddings array'));
    }
    return ok(embedding);
  }

  public async embedBatch(
    texts: readonly string[],
  ): Promise<Result<readonly (readonly number[])[]>> {
    if (texts.length === 0) return ok([]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.modelId, input: texts }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return fail(new EmbeddingFailedError(`Ollama embed HTTP ${res.status}: ${text}`));
      }

      const data = (await res.json()) as OllamaEmbedResponse;

      if (!data.embeddings || data.embeddings.length !== texts.length) {
        return fail(
          new EmbeddingFailedError(
            `Ollama returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`,
          ),
        );
      }

      return ok(data.embeddings);
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        return fail(new EmbeddingFailedError('Ollama embedding request timed out'));
      }
      return fail(
        new EmbeddingFailedError(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  public getDimensions(): number {
    return this.dimensions;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ─── llama.cpp Embedding Model ────────────────────────────────────────────────

interface LlamaCppEmbedResponse {
  embedding: number[];
}

export class LlamaCppEmbeddingModel implements IEmbeddingModel {
  private readonly serverUrl: string;
  private readonly dimensions: number;
  private readonly timeoutMs: number;

  constructor(serverUrl: string, dimensions: number, timeoutMs = 30_000) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.dimensions = dimensions;
    this.timeoutMs = timeoutMs;
  }

  public async embed(text: string): Promise<Result<readonly number[]>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.serverUrl}/embedding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return fail(new EmbeddingFailedError(`llama.cpp embed HTTP ${res.status}: ${errText}`));
      }

      const data = (await res.json()) as LlamaCppEmbedResponse;
      if (!data.embedding || data.embedding.length === 0) {
        return fail(new EmbeddingFailedError('llama.cpp returned empty embedding'));
      }
      return ok(data.embedding);
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        return fail(new EmbeddingFailedError('llama.cpp embedding request timed out'));
      }
      return fail(
        new EmbeddingFailedError(error instanceof Error ? error.message : String(error)),
      );
    }
  }

  public async embedBatch(
    texts: readonly string[],
  ): Promise<Result<readonly (readonly number[])[]>> {
    // llama.cpp server does not have native batch embedding — process sequentially
    const results: (readonly number[])[] = [];
    for (const text of texts) {
      const result = await this.embed(text);
      if (!result.ok) return result;
      results.push(result.value);
    }
    return ok(results);
  }

  public getDimensions(): number {
    return this.dimensions;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${this.serverUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmbeddingModel(
  config: EmbeddingConfig,
  runtimeBaseUrl: string,
): IEmbeddingModel | null {
  switch (config.provider) {
    case 'ollama':
      return new OllamaEmbeddingModel(
        runtimeBaseUrl,
        config.modelId,
        config.dimensions,
      );
    case 'llamacpp':
      return new LlamaCppEmbeddingModel(runtimeBaseUrl, config.dimensions);
    case 'none':
      return null;
    default: {
      const exhaustive: never = config.provider;
      return null;
    }
  }
}
