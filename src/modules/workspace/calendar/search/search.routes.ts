import { Router } from 'express';
import { SearchController } from './search.controller';

export function createSearchRouter(controller: SearchController): Router {
  const router = Router();
  router.get('/events', (req, res, next) => controller.search(req, res, next));
  return router;
}
