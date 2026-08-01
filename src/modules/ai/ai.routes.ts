import { AiModule } from './ai.module';

export function registerAiRoutes(router: any, module: AiModule): void {
  // Base Health
  router.get('/ai/health', (req: any, res: any) => module.aiController.healthCheck(req, res));

  // Assistant Chat
  router.post('/ai/assistant/chat', (req: any, res: any) => module.assistantController.chat(req, res));

  // Conversations
  router.post('/ai/conversations', (req: any, res: any) => module.conversationsController.create(req, res));
  router.get('/ai/conversations', (req: any, res: any) => module.conversationsController.list(req, res));
  router.get('/ai/conversations/:id', (req: any, res: any) => module.conversationsController.getById(req, res));
  router.put('/ai/conversations/:id', (req: any, res: any) => module.conversationsController.update(req, res));
  router.delete('/ai/conversations/:id', (req: any, res: any) => module.conversationsController.delete(req, res));

  // Memory
  router.post('/ai/memory', (req: any, res: any) => module.memoryController.store(req, res));
  router.get('/ai/memory', (req: any, res: any) => module.memoryController.query(req, res));
  router.delete('/ai/memory/cleanup/:userId', (req: any, res: any) => module.memoryController.cleanup(req, res));

  // Prompt Library
  router.post('/ai/prompts', (req: any, res: any) => module.promptLibraryController.create(req, res));
  router.post('/ai/prompts/:id/compile', (req: any, res: any) => module.promptLibraryController.compile(req, res));

  // Models
  router.get('/ai/models', (req: any, res: any) => module.modelsController.getModels(req, res));
  router.get('/ai/models/:id', (req: any, res: any) => module.modelsController.getModelById(req, res));

  // Embeddings & RAG
  router.post('/ai/embeddings', (req: any, res: any) => module.embeddingsController.generate(req, res));
  router.post('/ai/embeddings/search', (req: any, res: any) => module.embeddingsController.search(req, res));
  router.post('/ai/rag/retrieve', (req: any, res: any) => module.ragController.retrieve(req, res));

  // Streaming & Tools
  router.post('/ai/streaming/cancel/:streamId', (req: any, res: any) => module.streamingController.cancel(req, res));
  router.get('/ai/tools', (req: any, res: any) => module.toolsController.list(req, res));
  router.post('/ai/tools/execute', (req: any, res: any) => module.toolsController.execute(req, res));
}