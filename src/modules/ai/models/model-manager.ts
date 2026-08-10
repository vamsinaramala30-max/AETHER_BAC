/**
 * AETHER AI — Part 2 Model Manager
 * Coordinates model selection, active model tracking, model listing, and health checks.
 * Integrates with Part 1 LLM subsystem. Does NOT create another LLM engine.
 */

import type { ModelMetadata, ModelHealthReport } from './model-types.js';
import type { IModelStorage } from './model-storage.js';
import { modelStorage } from './model-storage.js';
import type { IModelHealthChecker } from './model-health.js';
import { modelHealthChecker } from './model-health.js';
import type { ILLMEngine } from '../llm/llm-engine.js';
import type { RuntimeStatus } from '../llm/llm-types.js';

export interface IModelManager {
  listModels(): Promise<readonly ModelMetadata[]>;
  getActiveModel(): Promise<ModelMetadata | undefined>;
  setActiveModel(modelId: string): Promise<ModelMetadata>;
  getModelHealth(modelId: string): Promise<ModelHealthReport>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
}

export class ModelManager implements IModelManager {
  private activeModelId?: string;

  constructor(
    private readonly storage: IModelStorage = modelStorage,
    private readonly healthChecker: IModelHealthChecker = modelHealthChecker,
    private readonly llmEngine?: ILLMEngine,
  ) {}

  public async listModels(): Promise<readonly ModelMetadata[]> {
    if (this.llmEngine) {
      const llmModels = await this.llmEngine.listModels();
      if (llmModels.ok) {
        const activeId = await this.getActiveModelId();
        return llmModels.value.map((info) => ({
          id: info.id,
          name: info.name,
          provider: 'ollama',
          family: info.familyName,
          parameterCount: info.parameterCount,
          contextLength: info.contextLength,
          quantization: info.quantization,
          sizeBytes: info.sizeBytes,
          isDefault: info.id === this.llmEngine?.getDefaultModelId(),
          isActive: info.id === activeId,
        }));
      }
    }

    return this.storage.listMetadata();
  }

  public async getActiveModel(): Promise<ModelMetadata | undefined> {
    const activeId = await this.getActiveModelId();
    if (!activeId) return undefined;

    const models = await this.listModels();
    return models.find((m) => m.id === activeId) ?? {
      id: activeId,
      name: activeId,
      provider: 'ollama',
      family: 'llama',
      contextLength: 8192,
      isDefault: true,
      isActive: true,
    };
  }

  public async setActiveModel(modelId: string): Promise<ModelMetadata> {
    this.activeModelId = modelId;

    const models = await this.listModels();
    const found = models.find((m) => m.id === modelId);

    if (found) {
      await this.storage.saveMetadata({ ...found, isActive: true });
      return { ...found, isActive: true };
    }

    const newMeta: ModelMetadata = {
      id: modelId,
      name: modelId,
      provider: 'ollama',
      family: 'llama',
      contextLength: 8192,
      isDefault: false,
      isActive: true,
    };

    await this.storage.saveMetadata(newMeta);
    return newMeta;
  }

  public async getModelHealth(modelId: string): Promise<ModelHealthReport> {
    return this.healthChecker.checkModelHealth(modelId);
  }

  public async getRuntimeStatus(): Promise<RuntimeStatus> {
    if (this.llmEngine) {
      return this.llmEngine.getRuntimeStatus();
    }
    return {
      runtimeType: 'none',
      status: 'unconfigured',
      checkedAt: Date.now(),
    };
  }

  private async getActiveModelId(): Promise<string | undefined> {
    if (this.activeModelId) {
      return this.activeModelId;
    }
    if (this.llmEngine) {
      return this.llmEngine.getDefaultModelId();
    }
    return undefined;
  }
}

export const modelManager = new ModelManager();
