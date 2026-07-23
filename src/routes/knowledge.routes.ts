import { Router } from 'express';
import { knowledgeController } from '../modules/knowledge/knowledge.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createKnowledgeBaseSchema } from '../validators/knowledge.validator';

const router = Router();

router.use(authenticate);

router.get('/', knowledgeController.getKnowledgeBases);
router.post('/', validate(createKnowledgeBaseSchema), knowledgeController.createKnowledgeBase);
router.get('/:id', knowledgeController.getKnowledgeBaseById);
router.delete('/:id', knowledgeController.deleteKnowledgeBase);

export const knowledgeRoutes = router;