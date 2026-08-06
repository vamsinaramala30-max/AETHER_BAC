import { Router } from 'express';
import { KnowledgeService } from '../modules/knowledge/knowledge.service';
import { KnowledgeRepository } from '../modules/knowledge/knowledge.repository';

const _knowledgeRepo = new KnowledgeRepository();
const _knowledgeService = new KnowledgeService(_knowledgeRepo);

const router = Router();

router.get('/graph', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    const nodes = await _knowledgeService.getGraphData(userId);
    res.status(200).json({ success: true, nodes });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const data = await _knowledgeService.getDashboardAnalytics(userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export const knowledgeRoutes: Router = router;
