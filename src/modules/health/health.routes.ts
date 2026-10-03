import { Router } from 'express';
import { healthController } from './health.controller';

const router = Router();

router.get('/', healthController.checkHealth);
router.get('/live', healthController.getLiveness);
router.get('/ready', (req, res) => healthController.getReadiness(req, res));

export const healthModuleRoutes: Router = router;
