import { AssistantService } from './assistant/assistant.service';
import { ConversationsService } from './conversations/conversations.service';
import { MemoryService } from './memory/memory.service';
import { PromptLibraryService } from './prompts/prompt-library.service';
import { ModelsService } from './models/models.service';
import { EmbeddingsService } from './embeddings/embeddings.service';
import { RagService } from './rag/rag.service';
import { StreamingService } from './streaming/streaming.service';
import { ToolsService } from './tools/tools.service';
import { ProviderFactory } from './providers/provider.factory';
import { OllamaProvider } from './providers/ollama.provider';

export class AiService {
  constructor(
    public readonly assistant: AssistantService,
    public readonly conversations: ConversationsService,
    public readonly memory: MemoryService,
    public readonly promptLibrary: PromptLibraryService,
    public readonly models: ModelsService,
    public readonly embeddings: EmbeddingsService,
    public readonly rag: RagService,
    public readonly streaming: StreamingService,
    public readonly tools: ToolsService,
    public readonly providerFactory?: ProviderFactory,
  ) {}

  public async getHealthStatus() {
    const ollama = this.providerFactory?.getOllamaProvider() || new OllamaProvider();
    const isOllamaRunning = await ollama.isAvailable();
    let installedModels: any[] = [];
    if (isOllamaRunning) {
      try {
        installedModels = await ollama.getModels();
      } catch {
        installedModels = [];
      }
    }

    return {
      status: isOllamaRunning ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      provider: 'ollama',
      ollamaStatus: isOllamaRunning ? 'connected' : 'disconnected',
      ollamaHost: ollama.getBaseUrl(),
      installedModels: installedModels.map((m) => m.name),
      activeModel: installedModels.length > 0 ? installedModels[0].name : 'llama3.1:8b (not installed)',
      services: {
        models: true,
        embeddings: isOllamaRunning,
        rag: true,
        memory: true,
      },
    };
  }
}
