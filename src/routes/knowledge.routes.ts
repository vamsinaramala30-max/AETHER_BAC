import { Router } from 'express';
import { KnowledgeController } from '../modules/knowledge/knowledge.controller';
import { KnowledgeService } from '../modules/knowledge/knowledge.service';
import { KnowledgeRepository } from '../modules/knowledge/knowledge.repository';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createKnowledgeBaseSchema } from '../validators/knowledge.validator';

const _knowledgeRepo = new KnowledgeRepository();
const _knowledgeService = new KnowledgeService(_knowledgeRepo);
const knowledgeController = new KnowledgeController(_knowledgeService);

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => {
  res.status(200).json({ data: [] });
});
router.post('/', validate(createKnowledgeBaseSchema), (req, res, next) => {
  res.status(201).json({ data: {} });
});
router.get('/:id', (req, res, next) => {
  res.status(200).json({ data: {} });
});
router.delete('/:id', (req, res, next) => {
  res.status(204).send();
});

export const knowledgeRoutes: Router = router;
