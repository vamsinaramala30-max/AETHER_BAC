import { Router } from 'express';
import { knowledgeController } from './knowledge.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createKnowledgeBaseSchema } from './knowledge.validator';

const router = Router();

router.use(authenticate);
router.get('/', knowledgeController.getKnowledgeBases);
router.post('/', validate(createKnowledgeBaseSchema), knowledgeController.createKnowledgeBase);
router.get('/:id', knowledgeController.getKnowledgeBaseById);
router.delete('/:id', knowledgeController.deleteKnowledgeBase);

export const knowledgeModuleRoutes: Router = router;
