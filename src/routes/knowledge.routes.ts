import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { KnowledgeService } from '../modules/knowledge/knowledge.service';
import { KnowledgeRepository } from '../modules/knowledge/knowledge.repository';
import { NotesController } from '../modules/knowledge/notes/notes/notes.controller';
import { DocumentsController } from '../modules/knowledge/documents/documents.controller';

const _knowledgeRepo = new KnowledgeRepository();
const _knowledgeService = new KnowledgeService(_knowledgeRepo);
const notesController = new NotesController(_knowledgeService.notesService);
const documentsController = new DocumentsController(_knowledgeService.documentsService);

const router = Router();

router.use(authenticate);

// Analytics & Dashboard
router.get('/stats', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const data = await _knowledgeService.getDashboardAnalytics(userId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/graph', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    const nodes = await _knowledgeService.getGraphData(userId);
    res.status(200).json({ success: true, nodes });
  } catch (err) {
    next(err);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    const activity = await _knowledgeService.getDateActivity();
    res.status(200).json({ success: true, activity });
  } catch (err) {
    next(err);
  }
});

router.get('/gaps', async (req, res, next) => {
  try {
    const gaps = await _knowledgeService.getKnowledgeGaps();
    res.status(200).json({ success: true, gaps });
  } catch (err) {
    next(err);
  }
});

// Notes Endpoints
router.get('/notes', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const result = await notesController.list({ query: req.query as any, user: { id: userId } });
    res.status(200).json({ success: true, data: result.data, total: result.total });
  } catch (err) {
    next(err);
  }
});

router.post('/notes', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const result = await notesController.create({ body: req.body, user: { id: userId } });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/notes/:id', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const result = await notesController.findOne({
      params: req.params as any,
      user: { id: userId },
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.patch('/notes/:id', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const result = await notesController.update({
      params: req.params as any,
      body: req.body,
      user: { id: userId },
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.delete('/notes/:id', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    await notesController.remove({ params: req.params as any, user: { id: userId } });
    res.status(200).json({ success: true, message: 'Note deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Documents Endpoints
router.get('/documents', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const result = await documentsController.list({
      query: req.query as any,
      user: { id: userId },
    });
    res.status(200).json({ success: true, data: result.data, total: result.total });
  } catch (err) {
    next(err);
  }
});

router.post('/documents', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const result = await documentsController.create({ body: req.body, user: { id: userId } });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/documents/:id', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const result = await documentsController.findOne({
      params: req.params as any,
      user: { id: userId },
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/documents/search', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    const query = req.body?.query || req.body?.text || '';
    const topK = typeof req.body?.topK === 'number' ? req.body.topK : 5;
    const result = await _knowledgeService.documentsService.searchDocuments(query, userId, topK);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.delete('/documents/:id', async (req, res, next) => {
  try {
    const userId = (req as any).user?.id || '';
    await _knowledgeService.documentsService.deleteDocument(req.params.id, userId);
    res.status(200).json({ success: true, message: 'Document deleted successfully' });
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
