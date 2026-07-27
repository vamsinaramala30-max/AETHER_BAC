import { Router } from 'express';
import { aiController } from '../modules/ai/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { chatSchema, generatePromptSchema } from '../validators/ai.validator';

const router = Router();

router.use(authenticate);

router.post('/chat', validate(chatSchema), aiController.chat);
router.post('/prompt', validate(generatePromptSchema), aiController.generatePrompt);
router.get('/conversations', aiController.getConversations);
router.get('/conversations/:id', aiController.getConversationById);

export const aiRoutes: Router = router;
