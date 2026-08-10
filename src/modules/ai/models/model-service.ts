/**
 * AETHER AI — Model Service
 * Service facade for listing models, getting model status/health, selecting active model.
 * Connects model management to the Part 1 LLM subsystem.
 */

import type { ModelMetadata, ModelHealthReport } from './model-types.js';
import type { IModelManager } from './model-manager.js';
import { modelManager } from './model-manager.js';
import type { RuntimeStatus } from '../llm/llm-types.js';

export interface IModelService {
  listModels(): Promise<readonly ModelMetadata[]>;
  getActiveModel(): Promise<ModelMetadata | undefined>;
  selectModel(modelId: string): Promise<ModelMetadata>;
  getModelStatus(modelId: string): Promise<ModelHealthReport>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
}

export class ModelService implements IModelService {
  constructor(private readonly manager: IModelManager = modelManager) {}

  public async listModels(): Promise<readonly ModelMetadata[]> {
    return this.manager.listModels();
  }

  public async getActiveModel(): Promise<ModelMetadata | undefined> {
    return this.manager.getActiveModel();
  }

  public async selectModel(modelId: string): Promise<ModelMetadata> {
    return this.manager.setActiveModel(modelId);
  }

  public async getModelStatus(modelId: string): Promise<ModelHealthReport> {
    return this.manager.getModelHealth(modelId);
  }

  public async getRuntimeStatus(): Promise<RuntimeStatus> {
    return this.manager.getRuntimeStatus();
  }
}

export const modelService = new ModelService();
