import { Router } from 'express';
import { AiModule } from '../modules/ai/ai.module';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { chatSchema, generatePromptSchema } from '../validators/ai.validator';

const _aiModule = new AiModule();
const aiController = _aiModule.aiController;
const modelsController = _aiModule.modelsController;

const router = Router();

router.use(authenticate);

router.post('/chat', validate(chatSchema), aiController.chat);
router.post('/prompt', validate(generatePromptSchema), aiController.generatePrompt);
router.get('/health', (req, res, next) => aiController.getHealth(req, res, next));

// Conversations Routes
router.get('/conversations', (req, res, next) => aiController.getConversations(req, res, next));
router.post('/conversations', (req, res, next) => aiController.createConversation(req, res, next));
router.get('/conversations/:id', (req, res, next) => aiController.getConversationById(req, res, next));
router.patch('/conversations/:id', (req, res, next) => aiController.renameConversation(req, res, next));
router.delete('/conversations/:id', (req, res, next) => aiController.deleteConversation(req, res, next));

// Models Routes
router.get('/models', (req, res, next) => modelsController.getModels(req, res, next));
router.get('/models/:id', (req, res, next) => modelsController.getModelById(req, res, next));

export const aiRoutes: Router = router;
