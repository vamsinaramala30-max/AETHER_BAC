import { ModelRegistryService } from './model-registry.service';
import { ModelRouterService } from './model-router.service';
import { ModelEntity } from './model.entity';
import { ProviderFactory } from '../providers/provider.factory';

export class ModelsService {
  constructor(
    private registry: ModelRegistryService,
    private router: ModelRouterService,
    private providerFactory?: ProviderFactory,
  ) {}

  public async getAllModels(): Promise<ModelEntity[]> {
    const staticModels = this.registry.listModels();
    const ollama = this.providerFactory?.getOllamaProvider();

    if (ollama) {
      try {
        const ollamaModels = await ollama.getModels();
        if (ollamaModels.length > 0) {
          const dynamicModels: ModelEntity[] = ollamaModels.map((m) => ({
            id: m.name,
            name: m.name,
            providerId: 'ollama',
            costPer1kPromptTokens: 0,
            costPer1kCompletionTokens: 0,
            capabilities: {
              streaming: true,
              toolCalling: true,
              vision: false,
              embeddings: true,
              maxContextTokens: 8192,
            },
            isActive: true,
            createdAt: new Date(),
          }));
          return [...dynamicModels, ...staticModels];
        }
      } catch {
        // Return static models if Ollama call fails
      }
    }

    return staticModels;
  }

  public getModelCapabilities(modelId: string) {
    const model = this.registry.getModel(modelId);
    return model
      ? model.capabilities
      : { streaming: true, toolCalling: true, vision: false, embeddings: true, maxContextTokens: 8192 };
  }

  public calculateEstimate(
    modelId: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    return this.router.estimateCost(modelId, promptTokens, completionTokens);
  }
}
