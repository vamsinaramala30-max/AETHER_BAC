import { Router } from 'express';
import { AssistantController } from './assistant.controller';
import { AssistantMiddleware } from './assistant.middleware';

export function createAssistantRouter(controller: AssistantController): Router {
  const router = Router();

  router.use(AssistantMiddleware.authenticate);
  router.use(AssistantMiddleware.rateLimiterHook);

  // Conversations
  router.post('/conversations', controller.createConversation);
  router.get('/conversations', controller.getConversations);
  router.get('/conversations/:id', controller.getConversationById);
  router.patch('/conversations/:id', controller.updateConversation);
  router.delete('/conversations/:id', controller.deleteConversation);

  // Messages
  router.get('/messages/:conversationId', controller.getMessages);
  router.patch('/messages/:id', controller.updateMessage);
  router.delete('/messages/:id', controller.deleteMessage);

  // Chat Operations
  router.post('/chat', controller.chatSync);
  router.post('/chat/stream', controller.chatStream);
  router.post('/chat/regenerate', controller.chatRegenerate);

  // Search & Analytics
  router.get('/search', controller.search);
  router.get('/analytics', controller.analytics);

  return router;
}