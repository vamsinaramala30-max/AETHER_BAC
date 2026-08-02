import { Router, RequestHandler } from 'express';
import { AssistantController } from './assistant.controller';
import { AssistantMiddleware } from './assistant.middleware';

export function createAssistantRouter(controller: AssistantController): Router {
  const router = Router();

  router.use(AssistantMiddleware.authenticate as RequestHandler);
  router.use(AssistantMiddleware.rateLimiterHook as RequestHandler);

  // Conversations
  router.post('/conversations', controller.createConversation as RequestHandler);
  router.get('/conversations', controller.getConversations as RequestHandler);
  router.get('/conversations/:id', controller.getConversationById as RequestHandler);
  router.patch('/conversations/:id', controller.updateConversation as RequestHandler);
  router.delete('/conversations/:id', controller.deleteConversation as RequestHandler);

  // Messages
  router.get('/messages/:conversationId', controller.getMessages as RequestHandler);
  router.patch('/messages/:id', controller.updateMessage as RequestHandler);
  router.delete('/messages/:id', controller.deleteMessage as RequestHandler);

  // Chat Operations
  router.post('/chat', controller.chatSync as RequestHandler);
  router.post('/chat/stream', controller.chatStream as RequestHandler);
  router.post('/chat/regenerate', controller.chatRegenerate as RequestHandler);

  // Search & Analytics
  router.get('/search', controller.search as RequestHandler);
  router.get('/analytics', controller.analytics as RequestHandler);

  return router;
}
