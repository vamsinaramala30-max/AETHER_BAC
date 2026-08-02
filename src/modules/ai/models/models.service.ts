import { ModelRegistryService } from './model-registry.service';
import { ModelRouterService } from './model-router.service';
import { ModelEntity } from './model.entity';

export class ModelsService {
  constructor(
    private registry: ModelRegistryService,
    private router: ModelRouterService,
  ) {}

  public getAllModels(): ModelEntity[] {
    return this.registry.listModels();
  }

  public getModelCapabilities(modelId: string) {
    const model = this.registry.getModel(modelId);
    return model ? model.capabilities : null;
  }

  public calculateEstimate(
    modelId: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    return this.router.estimateCost(modelId, promptTokens, completionTokens);
  }
}
