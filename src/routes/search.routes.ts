import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { searchRateLimiter } from '../middleware/rateLimit.middleware';
import { SearchController } from '../modules/knowledge/search/search.controller';
import { SearchService } from '../modules/knowledge/search/search.service';
import { SearchRepository } from '../modules/knowledge/search/search.repository';
import { GlobalSearchDto } from '../modules/knowledge/search/search.dto';

const router = Router();
const searchRepository = new SearchRepository();
const searchService = new SearchService(searchRepository);
const searchController = new SearchController(searchService);

router.use(authenticate);

// POST /api/v1/search (Canonical Global Search)
router.post('/', searchRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id || '';
    const workspaceId =
      (req.headers['x-workspace-id'] as string) ||
      (req.query.workspaceId as string) ||
      req.body?.workspaceId ||
      undefined;

    const dto: GlobalSearchDto = {
      query: req.body?.query || req.body?.q || '',
      searchType: req.body?.searchType,
      limit: req.body?.limit ? parseInt(req.body.limit, 10) : undefined,
      filters: req.body?.filters,
    };

    const result = await searchController.executeSearch({
      body: dto,
      user: { id: userId },
      workspaceId,
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/search (REST query param convenience)
router.get('/', searchRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id || '';
    const workspaceId =
      (req.headers['x-workspace-id'] as string) ||
      (req.query.workspaceId as string) ||
      undefined;

    const queryStr = (req.query.q as string) || (req.query.query as string) || '';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const dto: GlobalSearchDto = {
      query: queryStr,
      limit,
    };

    const result = await searchController.executeSearch({
      body: dto,
      user: { id: userId },
      workspaceId,
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/search/suggestions
router.get('/suggestions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string) || (req.query.query as string) || '';
    const suggestions = await searchController.getSuggestions({ query: { q } });
    res.status(200).json({ success: true, data: suggestions });
  } catch (err) {
    next(err);
  }
});

export const searchRoutes: Router = router;
