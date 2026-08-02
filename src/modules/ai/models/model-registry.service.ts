import { ModelEntity } from './model.entity';

export class ModelRegistryService {
  private models: Map<string, ModelEntity> = new Map();

  constructor() {
    this.seedDefaultModels();
  }

  private seedDefaultModels(): void {
    const defaults: ModelEntity[] = [
      {
        id: 'gpt-4o',
        name: 'GPT-4 Omni',
        providerId: 'openai',
        costPer1kPromptTokens: 0.005,
        costPer1kCompletionTokens: 0.015,
        capabilities: {
          streaming: true,
          toolCalling: true,
          vision: true,
          embeddings: false,
          maxContextTokens: 128000,
        },
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
        costPer1kPromptTokens: 0.003,
        costPer1kCompletionTokens: 0.015,
        capabilities: {
          streaming: true,
          toolCalling: true,
          vision: true,
          embeddings: false,
          maxContextTokens: 200000,
        },
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        providerId: 'gemini',
        costPer1kPromptTokens: 0.00125,
        costPer1kCompletionTokens: 0.005,
        capabilities: {
          streaming: true,
          toolCalling: true,
          vision: true,
          embeddings: false,
          maxContextTokens: 1000000,
        },
        isActive: true,
        createdAt: new Date(),
      },
    ];

    defaults.forEach((m) => this.models.set(m.id, m));
  }

  public getModel(id: string): ModelEntity | undefined {
    return this.models.get(id);
  }

  public listModels(): ModelEntity[] {
    return Array.from(this.models.values());
  }

  public registerModel(model: ModelEntity): void {
    this.models.set(model.id, model);
  }
}
