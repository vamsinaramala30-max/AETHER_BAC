import { Router } from 'express';
import { analyticsController } from '../modules/analytics/analytics.controller';
import { analyticsValidators } from '../modules/analytics/analytics.validators';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/overview', analyticsValidators.getAnalytics, analyticsController.getOverviewMetrics);
router.get('/usage', analyticsValidators.getAnalytics, analyticsController.getUsageMetrics);
router.get('/dashboard', analyticsValidators.getAnalytics, analyticsController.getDashboard);
router.get('/export', analyticsValidators.exportAnalytics, analyticsController.exportAnalytics);
router.get(
  '/productivity',
  analyticsValidators.productivityQuery,
  analyticsController.getDashboard,
);
router.get('/goals', analyticsValidators.goalAnalyticsQuery, analyticsController.getDashboard);
router.get('/time', analyticsValidators.timeAnalyticsQuery, analyticsController.getDashboard);
router.get(
  '/ai-recommendations',
  analyticsValidators.aiRecommendationQuery,
  analyticsController.getDashboard,
);

export const analyticsRoutes: Router = router;
