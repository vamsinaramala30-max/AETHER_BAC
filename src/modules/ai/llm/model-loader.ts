/**
 * AETHER AI — Model Loader
 * Handles model loading/unloading lifecycle via the runtime.
 * Reports typed statuses — never fakes model availability.
 */

import type { ModelId, Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import { ModelLoadFailedError, ModelUnavailableError } from '../ai-errors.js';
import type { IModelRuntime } from './model-runtime.js';
import type { InMemoryModelRegistry } from './model-registry.js';
import type { ModelStatus } from './llm-types.js';

// ─── IModelLoader Interface ───────────────────────────────────────────────────

export interface IModelLoader {
  ensureLoaded(modelId: ModelId): Promise<Result<ModelStatus>>;
  getStatus(modelId: ModelId): Promise<ModelStatus>;
}

// ─── Model Loader Implementation ──────────────────────────────────────────────

export class ModelLoader implements IModelLoader {
  private readonly loadingSet = new Set<ModelId>();

  constructor(
    private readonly runtime: IModelRuntime,
    private readonly registry: InMemoryModelRegistry,
  ) {}

  /**
   * Ensures the model is available in the runtime.
   * For Ollama, this is a health-check / pull verification.
   * Does NOT pretend the model is loaded if it is not.
   */
  public async ensureLoaded(modelId: ModelId): Promise<Result<ModelStatus>> {
    // Check if already loading (prevent duplicate requests)
    if (this.loadingSet.has(modelId)) {
      return fail(
        new ModelLoadFailedError(modelId, 'Model is currently being loaded. Please retry.'),
      );
    }

    const existingStatus = this.registry.getStatus(modelId);
    if (existingStatus?.status === 'loaded' || existingStatus?.status === 'available') {
      return ok(existingStatus);
    }

    this.loadingSet.add(modelId);
    this.registry.setStatus(modelId, {
      modelId,
      status: 'loading',
      checkedAt: Date.now(),
    });

    try {
      // Refresh the registry from the runtime to get current availability
      await this.registry.refresh(this.runtime);

      const refreshedStatus = this.registry.getStatus(modelId);
      if (
        !refreshedStatus ||
        (refreshedStatus.status !== 'available' && refreshedStatus.status !== 'loaded')
      ) {
        const status: ModelStatus = {
          modelId,
          status: 'unavailable',
          errorMessage: `Model "${modelId}" is not available in the runtime. Pull it first (e.g., ollama pull ${modelId}).`,
          checkedAt: Date.now(),
        };
        this.registry.setStatus(modelId, status);
        this.loadingSet.delete(modelId);
        return fail(new ModelUnavailableError(modelId));
      }

      const loadedStatus: ModelStatus = {
        modelId,
        status: 'loaded',
        info: refreshedStatus.info,
        checkedAt: Date.now(),
      };
      this.registry.setStatus(modelId, loadedStatus);
      this.loadingSet.delete(modelId);
      return ok(loadedStatus);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const failedStatus: ModelStatus = {
        modelId,
        status: 'error',
        errorMessage: err.message,
        checkedAt: Date.now(),
      };
      this.registry.setStatus(modelId, failedStatus);
      this.loadingSet.delete(modelId);
      return fail(new ModelLoadFailedError(modelId, err.message, err));
    }
  }

  public async getStatus(modelId: ModelId): Promise<ModelStatus> {
    const cached = this.registry.getStatus(modelId);
    if (cached) return cached;

    // Not in registry — try refreshing
    await this.registry.refresh(this.runtime);
    const after = this.registry.getStatus(modelId);
    if (after) return after;

    return {
      modelId,
      status: 'unavailable',
      errorMessage: `Model "${modelId}" was not found after runtime refresh.`,
      checkedAt: Date.now(),
    };
  }
}
