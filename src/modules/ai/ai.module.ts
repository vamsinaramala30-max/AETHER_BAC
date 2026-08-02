import { ProviderFactory } from './providers/provider.factory';
import { ModelRegistryService } from './models/model-registry.service';
import { ModelRouterService } from './models/model-router.service';
import { ModelsService } from './models/models.service';
import { ModelsController } from './models/models.controller';

import { ConversationsRepository } from './conversations/conversations.repository';
import { ConversationsService } from './conversations/conversations.service';
import { ConversationsController } from './conversations/conversations.controller';

import { MemoryRepository } from './memory/memory.repository';
import { MemoryService } from './memory/memory.service';
import { MemoryController } from './memory/memory.controller';

import { PromptLibraryRepository } from './prompts/prompt-library.repository';
import { PromptLibraryService } from './prompts/prompt-library.service';
import { PromptLibraryController } from './prompts/prompt-library.controller';

import { VectorRepository } from './embeddings/vector.repository';
import { EmbeddingsService } from './embeddings/embeddings.service';
import { EmbeddingsController } from './embeddings/embeddings.controller';

import { RetrievalService } from './rag/retrieval.service';
import { RerankerService } from './rag/reranker.service';
import { RagService } from './rag/rag.service';
import { RagController } from './rag/rag.controller';

import { StreamGateway } from './streaming/stream.gateway';
import { StreamingService } from './streaming/streaming.service';
import { StreamingController } from './streaming/streaming.controller';

import { ToolRegistryService } from './tools/tool-registry.service';
import { ToolExecutorService } from './tools/tool-executor.service';
import { ToolsService } from './tools/tools.service';
import { ToolsController } from './tools/tools.controller';

import { AssistantRepository } from './assistant/assistant.repository';
import { AssistantService } from './assistant/assistant.service';
import { AssistantController } from './assistant/assistant.controller';

import { AiRepository } from './ai.repository';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

export class AiModule {
  public readonly providerFactory = new ProviderFactory();
  public readonly modelRegistry = new ModelRegistryService();
  public readonly modelRouter = new ModelRouterService(this.modelRegistry);
  public readonly modelsService = new ModelsService(this.modelRegistry, this.modelRouter);
  public readonly modelsController = new ModelsController(this.modelsService);

  public readonly conversationsRepository = new ConversationsRepository();
  public readonly conversationsService = new ConversationsService(this.conversationsRepository);
  public readonly conversationsController = new ConversationsController(this.conversationsService);

  public readonly memoryRepository = new MemoryRepository();
  public readonly memoryService = new MemoryService(this.memoryRepository);
  public readonly memoryController = new MemoryController(this.memoryService);

  public readonly promptLibraryRepository = new PromptLibraryRepository();
  public readonly promptLibraryService = new PromptLibraryService(this.promptLibraryRepository);
  public readonly promptLibraryController = new PromptLibraryController(this.promptLibraryService);

  public readonly vectorRepository = new VectorRepository();
  public readonly embeddingsService = new EmbeddingsService(
    this.providerFactory,
    this.vectorRepository,
  );
  public readonly embeddingsController = new EmbeddingsController(this.embeddingsService);

  public readonly retrievalService = new RetrievalService();
  public readonly rerankerService = new RerankerService();
  public readonly ragService = new RagService(this.retrievalService, this.rerankerService);
  public readonly ragController = new RagController(this.ragService);

  public readonly streamGateway = new StreamGateway();
  public readonly streamingService = new StreamingService(this.streamGateway);
  public readonly streamingController = new StreamingController(this.streamingService);

  public readonly toolRegistry = new ToolRegistryService();
  public readonly toolExecutor = new ToolExecutorService(this.toolRegistry);
  public readonly toolsService = new ToolsService(this.toolRegistry, this.toolExecutor);
  public readonly toolsController = new ToolsController(this.toolsService);

  public readonly assistantRepository = new AssistantRepository();
  public readonly assistantService = new AssistantService(this.assistantRepository);
  public readonly assistantController = new AssistantController(this.assistantService);

  public readonly aiRepository = new AiRepository();
  public readonly aiService = new AiService(
    this.assistantService,
    this.conversationsService,
    this.memoryService,
    this.promptLibraryService,
    this.modelsService,
    this.embeddingsService,
    this.ragService,
    this.streamingService,
    this.toolsService,
  );
  public readonly aiController = new AiController(this.aiService);
}
