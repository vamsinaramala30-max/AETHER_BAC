/**
 * AETHER AI — Model Repository
 * Persistence layer for registered model metadata. Pure persistence only.
 */

import type { ModelMetadata } from '../../models/model-types.js';

export interface IModelRepository {
  save(metadata: ModelMetadata): Promise<void>;
  getById(id: string): Promise<ModelMetadata | undefined>;
  list(): Promise<readonly ModelMetadata[]>;
  delete(id: string): Promise<boolean>;
}

export class ModelRepository implements IModelRepository {
  private readonly models = new Map<string, ModelMetadata>();

  public async save(metadata: ModelMetadata): Promise<void> {
    this.models.set(metadata.id, metadata);
  }

  public async getById(id: string): Promise<ModelMetadata | undefined> {
    return this.models.get(id);
  }

  public async list(): Promise<readonly ModelMetadata[]> {
    return Array.from(this.models.values());
  }

  public async delete(id: string): Promise<boolean> {
    return this.models.delete(id);
  }
}

export const modelRepository = new ModelRepository();
