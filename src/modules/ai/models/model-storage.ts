/**
 * AETHER AI — Local Model Storage Abstraction
 * Abstraction for local model file storage and registered model metadata persistence.
 * Uses ModelRepository for database persistence.
 */

import type { LocalModelFileInfo, ModelMetadata } from './model-types.js';
import type { IModelRepository } from '../storage/repositories/model-repository.js';
import { modelRepository } from '../storage/repositories/model-repository.js';

export interface IModelStorage {
  saveMetadata(metadata: ModelMetadata): Promise<void>;
  getMetadata(modelId: string): Promise<ModelMetadata | undefined>;
  listMetadata(): Promise<readonly ModelMetadata[]>;
  deleteMetadata(modelId: string): Promise<boolean>;
  listLocalModelFiles(): Promise<readonly LocalModelFileInfo[]>;
}

export class ModelStorage implements IModelStorage {
  constructor(private readonly repo: IModelRepository = modelRepository) {}

  public async saveMetadata(metadata: ModelMetadata): Promise<void> {
    await this.repo.save(metadata);
  }

  public async getMetadata(modelId: string): Promise<ModelMetadata | undefined> {
    return this.repo.getById(modelId);
  }

  public async listMetadata(): Promise<readonly ModelMetadata[]> {
    return this.repo.list();
  }

  public async deleteMetadata(modelId: string): Promise<boolean> {
    return this.repo.delete(modelId);
  }

  public async listLocalModelFiles(): Promise<readonly LocalModelFileInfo[]> {
    // Standard local storage inspection boundary
    return [];
  }
}

export const modelStorage = new ModelStorage();
