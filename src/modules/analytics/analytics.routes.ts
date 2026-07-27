import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/overview', analyticsController.getOverviewMetrics);
router.get('/usage', analyticsController.getUsageMetrics);

export const analyticsModuleRoutes: Router = router;
