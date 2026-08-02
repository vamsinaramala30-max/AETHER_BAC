import { ModelRegistryService } from './model-registry.service';
import { ModelEntity } from './model.entity';

export class ModelRouterService {
  constructor(private modelRegistry: ModelRegistryService) {}

  public resolveModel(
    requestedModelId?: string,
    requirements?: { vision?: boolean; maxTokens?: number },
  ): ModelEntity {
    if (requestedModelId) {
      const model = this.modelRegistry.getModel(requestedModelId);
      if (model && model.isActive) return model;
    }

    const available = this.modelRegistry.listModels().filter((m) => m.isActive);
    if (requirements?.vision) {
      const visionModel = available.find((m) => m.capabilities.vision);
      if (visionModel) return visionModel;
    }

    return available[0] || this.modelRegistry.getModel('gpt-4o')!;
  }

  public estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
    const model = this.modelRegistry.getModel(modelId);
    if (!model) return 0;
    const promptCost = (promptTokens / 1000) * model.costPer1kPromptTokens;
    const completionCost = (completionTokens / 1000) * model.costPer1kCompletionTokens;
    return promptCost + completionCost;
  }
}
