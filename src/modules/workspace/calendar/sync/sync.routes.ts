import { Router } from 'express';
import { SyncController } from './sync.controller';

export function createSyncRouter(controller: SyncController): Router {
  const router = Router();
  router.post('/google', (req, res, next) => controller.syncGoogle(req, res, next));
  router.post('/outlook', (req, res, next) => controller.syncOutlook(req, res, next));
  router.post('/apple', (req, res, next) => controller.syncApple(req, res, next));
  return router;
}