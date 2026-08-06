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
router.get('/conversations', aiController.getConversations);
router.get('/conversations/:id', aiController.getConversationById);

// Models Routes
router.get('/models', (req, res) => modelsController.getModels(req, res));
router.get('/models/:id', (req, res) => modelsController.getModelById(req, res));

export const aiRoutes: Router = router;
