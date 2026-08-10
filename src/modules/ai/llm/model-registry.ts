/**
 * AETHER AI — Model Registry
 * Tracks available models and their metadata.
 * Purely in-memory — no cloud API lookups.
 */

import type { ModelId } from '../ai-types.js';
import type { IModelRuntime } from './model-runtime.js';
import type { ModelInfo, ModelStatus } from './llm-types.js';
import { ModelUnavailableError } from '../ai-errors.js';
import type { Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';

// ─── Model Registry Interface ─────────────────────────────────────────────────

export interface IModelRegistry {
  register(info: ModelInfo): void;
  unregister(modelId: ModelId): void;
  getModel(modelId: ModelId): ModelInfo | undefined;
  listModels(): readonly ModelInfo[];
  getStatus(modelId: ModelId): ModelStatus | undefined;
  setStatus(modelId: ModelId, status: ModelStatus): void;
  refresh(runtime: IModelRuntime): Promise<void>;
}

// ─── In-Memory Model Registry ─────────────────────────────────────────────────

export class InMemoryModelRegistry implements IModelRegistry {
  private readonly models = new Map<ModelId, ModelInfo>();
  private readonly statuses = new Map<ModelId, ModelStatus>();

  public register(info: ModelInfo): void {
    this.models.set(info.id, info);
    if (!this.statuses.has(info.id)) {
      this.statuses.set(info.id, {
        modelId: info.id,
        status: 'available',
        info,
        checkedAt: Date.now(),
      });
    }
  }

  public unregister(modelId: ModelId): void {
    this.models.delete(modelId);
    this.statuses.delete(modelId);
  }

  public getModel(modelId: ModelId): ModelInfo | undefined {
    return this.models.get(modelId);
  }

  public listModels(): readonly ModelInfo[] {
    return Array.from(this.models.values());
  }

  public getStatus(modelId: ModelId): ModelStatus | undefined {
    return this.statuses.get(modelId);
  }

  public setStatus(modelId: ModelId, status: ModelStatus): void {
    this.statuses.set(modelId, status);
  }

  public async refresh(runtime: IModelRuntime): Promise<void> {
    const result = await runtime.listModels();
    if (!result.ok) {
      // Mark all known models as unavailable
      for (const [id, info] of this.models) {
        this.statuses.set(id, {
          modelId: id,
          status: 'unavailable',
          info,
          errorMessage: result.error.message,
          checkedAt: Date.now(),
        });
      }
      return;
    }

    const discoveredIds = new Set<ModelId>();
    for (const info of result.value) {
      this.register(info);
      this.statuses.set(info.id, {
        modelId: info.id,
        status: 'available',
        info,
        checkedAt: Date.now(),
      });
      discoveredIds.add(info.id);
    }

    // Mark previously registered models that are no longer available
    for (const [id] of this.models) {
      if (!discoveredIds.has(id)) {
        const existing = this.statuses.get(id);
        this.statuses.set(id, {
          modelId: id,
          status: 'unavailable',
          info: existing?.info,
          errorMessage: 'Model not found in runtime listing',
          checkedAt: Date.now(),
        });
      }
    }
  }

  public requireModel(modelId: ModelId): Result<ModelInfo> {
    const info = this.models.get(modelId);
    if (!info) {
      return fail(new ModelUnavailableError(modelId));
    }
    const status = this.statuses.get(modelId);
    if (status && status.status === 'unavailable') {
      return fail(new ModelUnavailableError(modelId));
    }
    return ok(info);
  }
}
