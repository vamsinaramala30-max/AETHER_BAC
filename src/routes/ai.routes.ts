import { Router } from 'express';
import { AiModule } from '../modules/ai/ai.module';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { aiRateLimiter } from '../middleware/rateLimit.middleware';
import { chatSchema, generatePromptSchema } from '../validators/ai.validator';

const _aiModule = new AiModule();
const aiController = _aiModule.aiController;
const modelsController = _aiModule.modelsController;
const memoryController = _aiModule.memoryController;
const toolsController = _aiModule.toolsController;
const plansController = _aiModule.plansController;
const executionController = _aiModule.executionController;
const diagnosticController = _aiModule.diagnosticController;

const router = Router();

// Public / Health Endpoints (Optional Auth)
router.get('/health', optionalAuthenticate, (req, res, next) => aiController.getHealth(req, res, next));
router.get('/internal/health', optionalAuthenticate, (req, res, next) =>
  diagnosticController.getHealth(req, res, next),
);
router.get('/providers/status', optionalAuthenticate, (req, res, next) =>
  aiController.getProvidersStatus(req, res, next),
);
router.get('/models', optionalAuthenticate, (req, res, next) =>
  modelsController.getModels(req, res, next),
);
router.get('/models/:id', optionalAuthenticate, (req, res, next) =>
  modelsController.getModelById(req, res, next),
);

// Protected Operational Endpoints (Mandatory Auth)
router.use(authenticate);

// Production Diagnostics & Distributed Tracing (Prompt 9)
router.get('/internal/metrics', (req, res, next) => diagnosticController.getMetrics(req, res, next));
router.get('/internal/executions/:id/trace', (req, res, next) =>
  diagnosticController.getExecutionTrace(req, res, next),
);

router.post('/chat', aiRateLimiter, validate(chatSchema), (req, res, next) => aiController.chat(req, res, next));
router.post('/stream', aiRateLimiter, (req, res, next) => aiController.stream(req, res, next));
router.post('/chat/stream', aiRateLimiter, (req, res, next) => aiController.stream(req, res, next));
router.post('/prompt', aiRateLimiter, validate(generatePromptSchema), (req, res, next) =>
  aiController.generatePrompt(req, res, next),
);

// Autonomous Agent Execution Loop Routes (Prompt 8)
router.post('/agent/execute', aiRateLimiter, (req, res, next) => executionController.startExecution(req, res, next));

router.get('/agent/executions/:id', (req, res, next) => executionController.getExecution(req, res, next));
router.post('/agent/executions/:id/cancel', (req, res, next) => executionController.cancelExecution(req, res, next));
router.post('/agent/executions/:id/approve', (req, res, next) => executionController.approveStep(req, res, next));
router.post('/agent/executions/:id/input', (req, res, next) => executionController.provideInput(req, res, next));

// Reasoning & Planning Routes (Prompt 7)
router.post('/plans', (req, res, next) => plansController.createPlan(req, res, next));
router.get('/plans/:id', (req, res, next) => plansController.getPlanById(req, res, next));
router.post('/plans/:id/validate', (req, res, next) => plansController.validatePlan(req, res, next));
router.post('/plans/:id/cancel', (req, res, next) => plansController.cancelPlan(req, res, next));

// Tools & Verified Actions Routes (Authoritative Prompt 6)
router.get('/tools', (req, res, next) => toolsController.listTools(req, res, next));
router.get('/tools/executions', (req, res, next) => toolsController.getExecutions(req, res, next));
router.get('/tools/executions/:id', (req, res, next) => toolsController.getExecutionById(req, res, next));
router.get('/tools/:name', (req, res, next) => toolsController.getTool(req, res, next));
router.post('/tools/execute', (req, res, next) => toolsController.executeTool(req, res, next));

// Memory Routes
router.get('/memory', (req, res, next) => memoryController.getMemories(req, res, next));
router.post('/memory', (req, res, next) => memoryController.createMemory(req, res, next));
router.post('/memory/search', (req, res, next) => memoryController.searchMemories(req, res, next));
router.get('/memory/:id', (req, res, next) => memoryController.getMemoryById(req, res, next));
router.patch('/memory/:id', (req, res, next) => memoryController.updateMemory(req, res, next));
router.delete('/memory/:id', (req, res, next) => memoryController.deleteMemory(req, res, next));

// Conversations Routes
router.get('/conversations', (req, res, next) => aiController.getConversations(req, res, next));
router.post('/conversations', (req, res, next) => aiController.createConversation(req, res, next));
router.get('/conversations/:id', (req, res, next) =>
  aiController.getConversationById(req, res, next),
);
router.patch('/conversations/:id', (req, res, next) =>
  aiController.renameConversation(req, res, next),
);
router.delete('/conversations/:id', (req, res, next) =>
  aiController.deleteConversation(req, res, next),
);

// Messages Sub-Routes
router.get('/conversations/:id/messages', (req, res, next) =>
  aiController.getMessages(req, res, next),
);
router.post('/conversations/:id/messages', (req, res, next) =>
  aiController.addMessage(req, res, next),
);
router.delete('/conversations/:id/messages/:messageId?', (req, res, next) =>
  aiController.deleteMessage(req, res, next),
);

export const aiRoutes: Router = router;
