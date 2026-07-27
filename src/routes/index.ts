import { Router } from 'express';
import { healthRoutes } from './health.routes';
import { authRoutes } from './auth.routes';
import { usersRoutes } from './users.routes';
import { aiRoutes } from './ai.routes';
import { workspaceRoutes } from './workspace.routes';
import { projectRoutes } from './project.routes';
import { knowledgeRoutes } from './knowledge.routes';
import { automationRoutes } from './automation.routes';
import { uploadRoutes } from './upload.routes';
import { notificationRoutes } from './notification.routes';
import { analyticsRoutes } from './analytics.routes';
import { settingsRoutes } from './settings.routes';
import { adminRoutes } from './admin.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/ai', aiRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/projects', projectRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/automations', automationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);
router.use('/admin', adminRoutes);

export const apiRoutes: Router = router;
