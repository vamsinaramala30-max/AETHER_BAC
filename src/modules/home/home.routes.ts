import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { HomeRepository } from './home.repository';

import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { DashboardRepository } from './dashboard/dashboard.repository';

import { DailyOverviewController } from './daily-overview/daily-overview.controller';
import { DailyOverviewService } from './daily-overview/daily-overview.service';
import { DailyOverviewRepository } from './daily-overview/daily-overview.repository';

import { TodaysScheduleController } from './todays-schedule/todays-schedule.controller';
import { TodaysScheduleService } from './todays-schedule/todays-schedule.service';
import { TodaysScheduleRepository } from './todays-schedule/todays-schedule.repository';

import { RecentActivityController } from './recent-activity/recent-activity.controller';
import { RecentActivityService } from './recent-activity/recent-activity.service';
import { RecentActivityRepository } from './recent-activity/recent-activity.repository';

import { QuickActionsController } from './quick-actions/quick-actions.controller';
import { QuickActionsService } from './quick-actions/quick-actions.service';
import { QuickActionsRepository } from './quick-actions/quick-actions.repository';

import { ContinueWorkingController } from './continue-working/continue-working.controller';
import { ContinueWorkingService } from './continue-working/continue-working.service';
import { ContinueWorkingRepository } from './continue-working/continue-working.repository';

import { AIRecommendationsController } from './ai-recommendations/ai-recommendations.controller';
import { AIRecommendationsService } from './ai-recommendations/ai-recommendations.service';
import { AIRecommendationsRepository } from './ai-recommendations/ai-recommendations.repository';

import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationsRepository } from './notifications/notifications.repository';

import { WidgetsController } from './widgets/widgets.controller';
import { WidgetsService } from './widgets/widgets.service';
import { WidgetsRepository } from './widgets/widgets.repository';

export function createHomeRouter(prisma: PrismaClient): Router {
  const router = Router();

  // Root Home
  const homeRepo = new HomeRepository(prisma);
  const homeService = new HomeService(homeRepo);
  const homeController = new HomeController(homeService);

  // Dashboard
  const dashboardRepo = new DashboardRepository(prisma);
  const dashboardService = new DashboardService(dashboardRepo);
  const dashboardController = new DashboardController(dashboardService);

  // Daily Overview
  const dailyRepo = new DailyOverviewRepository(prisma);
  const dailyService = new DailyOverviewService(dailyRepo);
  const dailyController = new DailyOverviewController(dailyService);

  // Schedule
  const scheduleRepo = new TodaysScheduleRepository(prisma);
  const scheduleService = new TodaysScheduleService(scheduleRepo);
  const scheduleController = new TodaysScheduleController(scheduleService);

  // Recent Activity
  const activityRepo = new RecentActivityRepository(prisma);
  const activityService = new RecentActivityService(activityRepo);
  const activityController = new RecentActivityController(activityService);

  // Quick Actions
  const actionsRepo = new QuickActionsRepository(prisma);
  const actionsService = new QuickActionsService(actionsRepo);
  const actionsController = new QuickActionsController(actionsService);

  // Continue Working
  const workRepo = new ContinueWorkingRepository(prisma);
  const workService = new ContinueWorkingService(workRepo);
  const workController = new ContinueWorkingController(workService);

  // AI Recommendations
  const aiRepo = new AIRecommendationsRepository(prisma);
  const aiService = new AIRecommendationsService(aiRepo);
  const aiController = new AIRecommendationsController(aiService);

  // Notifications
  const notifRepo = new NotificationsRepository(prisma);
  const notifService = new NotificationsService(notifRepo);
  const notifController = new NotificationsController(notifService);

  // Widgets
  const widgetsRepo = new WidgetsRepository(prisma);
  const widgetsService = new WidgetsService(widgetsRepo);
  const widgetsController = new WidgetsController(widgetsService);

  // Route definitions
  router.get('/', (req, res) => homeController.getHomeFeed(req, res));
  router.get('/dashboard', (req, res) => dashboardController.getSummary(req, res));
  router.get('/daily-overview', (req, res) => dailyController.getOverview(req, res));
  router.get('/todays-schedule', (req, res) => scheduleController.getSchedule(req, res));
  router.get('/recent-activity', (req, res) => activityController.getActivity(req, res));
  router.get('/quick-actions', (req, res) => actionsController.getActions(req, res));
  router.post('/quick-actions/execute', (req, res) => actionsController.execute(req, res));
  router.get('/continue-working', (req, res) => workController.getRecentWork(req, res));
  router.get('/ai-recommendations', (req, res) => aiController.getRecommendations(req, res));
  router.get('/notifications', (req, res) => notifController.getNotifications(req, res));
  router.post('/notifications/read', (req, res) => notifController.markAsRead(req, res));
  router.get('/widgets', (req, res) => widgetsController.getWidgets(req, res));

  return router;
}