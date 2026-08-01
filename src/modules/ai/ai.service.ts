import { AssistantService } from './assistant/assistant.service';
import { ConversationsService } from './conversations/conversations.service';
import { MemoryService } from './memory/memory.service';
import { PromptLibraryService } from './prompt/prompt-library.service';
import { ModelsService } from './models/models.service';
import { EmbeddingsService } from './embeddings/embeddings.service';
import { RagService } from './rag/rag.service';
import { StreamingService } from './streaming/streaming.service';
import { ToolsService } from './tools/tools.service';

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
    public readonly tools: ToolsService
  ) {}

  public async getHealthStatus() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        models: true,
        embeddings: true,
        rag: true,
        memory: true,
      },
    };
  }
}