/**
 * AETHER AI — Model Manager
 * Coordinates runtime, registry, and loader.
 * Single point of contact for model lifecycle operations.
 */

import type { ModelId, Result } from '../ai-types.js';
import { ok, fail } from '../ai-types.js';
import type { AIConfig } from '../ai-config.js';
import { createModelRuntime } from './model-runtime.js';
import type { IModelRuntime } from './model-runtime.js';
import { InMemoryModelRegistry } from './model-registry.js';
import type { IModelRegistry } from './model-registry.js';
import { ModelLoader } from './model-loader.js';
import type { IModelLoader } from './model-loader.js';
import type { ModelInfo, ModelStatus, RuntimeStatus } from './llm-types.js';
import { ModelUnavailableError } from '../ai-errors.js';

// ─── IModelManager Interface ──────────────────────────────────────────────────

export interface IModelManager {
  initialize(): Promise<void>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
  listModels(): Promise<Result<readonly ModelInfo[]>>;
  getModelStatus(modelId: ModelId): Promise<ModelStatus>;
  ensureModelLoaded(modelId: ModelId): Promise<Result<ModelStatus>>;
  getDefaultModelId(): ModelId;
  destroy(): Promise<void>;
}

// ─── Model Manager Implementation ─────────────────────────────────────────────

export class ModelManager implements IModelManager {
  private readonly runtime: IModelRuntime;
  private readonly registry: InMemoryModelRegistry;
  private readonly loader: IModelLoader;
  private readonly defaultModelId: ModelId;
  private initialized = false;

  constructor(config: AIConfig) {
    this.runtime = createModelRuntime(config.runtime);
    this.registry = new InMemoryModelRegistry();
    this.loader = new ModelLoader(this.runtime, this.registry);
    this.defaultModelId = config.model.defaultModelId;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.registry.refresh(this.runtime);
    this.initialized = true;
  }

  public async getRuntimeStatus(): Promise<RuntimeStatus> {
    return this.runtime.healthCheck();
  }

  public async listModels(): Promise<Result<readonly ModelInfo[]>> {
    await this.registry.refresh(this.runtime);
    const models = this.registry.listModels();
    return ok(models);
  }

  public async getModelStatus(modelId: ModelId): Promise<ModelStatus> {
    return this.loader.getStatus(modelId);
  }

  public async ensureModelLoaded(modelId: ModelId): Promise<Result<ModelStatus>> {
    const runtimeStatus = await this.runtime.healthCheck();
    if (runtimeStatus.status === 'unavailable' || runtimeStatus.status === 'unconfigured') {
      return fail(new ModelUnavailableError(modelId));
    }
    return this.loader.ensureLoaded(modelId);
  }

  public getDefaultModelId(): ModelId {
    return this.defaultModelId;
  }

  public async destroy(): Promise<void> {
    await this.runtime.destroy();
  }

  /** Expose the underlying runtime for direct generation calls from LLMEngine */
  public getRuntime(): IModelRuntime {
    return this.runtime;
  }

  /** Expose the registry for status queries */
  public getRegistry(): IModelRegistry {
    return this.registry;
  }
}
