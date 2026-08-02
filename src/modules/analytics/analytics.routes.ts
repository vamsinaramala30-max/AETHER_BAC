import { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { analyticsController } from './analytics.controller';
import { analyticsValidators } from './analytics.validators';

export const createAnalyticsRouter = (_prisma: PrismaClient): Router => {
  const router = Router();

  router.use(authenticate);

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

  return router;
};
