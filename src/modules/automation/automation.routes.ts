import { Router } from 'express';
import { automationController } from './automation.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { automationRateLimiter } from '../../middleware/rateLimit.middleware';
import {
  createAutomationSchema,
  updateAutomationSchema,
  runAutomationSchema,
  approveExecutionSchema,
  rejectExecutionSchema,
} from './automation.validator';

const router: Router = Router();

router.use(authenticate);

// Intent Parser & Dashboard Stats
router.post('/parse-intent', automationRateLimiter, automationController.parseIntent.bind(automationController));
router.get('/stats', automationController.getStats.bind(automationController));

// Activity audit logs & Templates
router.get('/automation-activity', automationController.getAllActivity.bind(automationController));
router.get('/automation-templates', automationController.getTemplates.bind(automationController));
router.get('/templates', automationController.getTemplates.bind(automationController));

// Automation CRUD
router.get('/automations', automationController.getAutomations.bind(automationController));
router.get('/workflows', automationController.getAutomations.bind(automationController));
router.get('/logs', automationController.getLogs.bind(automationController));
router.get('/', automationController.getAutomations.bind(automationController));

router.post(
  '/',
  automationRateLimiter,
  validate(createAutomationSchema),
  automationController.createAutomation.bind(automationController),
);
router.post(
  '/automations',
  automationRateLimiter,
  validate(createAutomationSchema),
  automationController.createAutomation.bind(automationController),
);

router.get('/:id', automationController.getAutomationById.bind(automationController));
router.put(
  '/:id',
  validate(updateAutomationSchema),
  automationController.updateAutomation.bind(automationController),
);
router.patch(
  '/:id',
  validate(updateAutomationSchema),
  automationController.updateAutomation.bind(automationController),
);
router.delete('/:id', automationController.deleteAutomation.bind(automationController));

// Execution state control
router.post('/:id/activate', automationController.activateAutomation.bind(automationController));
router.post('/:id/pause', automationController.pauseAutomation.bind(automationController));
router.post(
  '/:id/run',
  automationRateLimiter,
  validate(runAutomationSchema),
  automationController.runAutomation.bind(automationController),
);


// Execution history & Activity
router.get('/:id/activity', automationController.getAutomationActivity.bind(automationController));
router.get('/:id/executions', automationController.getExecutions.bind(automationController));

// Execution Approvals
router.post(
  '/:id/executions/:executionId/approve',
  validate(approveExecutionSchema),
  automationController.approveExecution.bind(automationController),
);
router.post(
  '/:id/executions/:executionId/reject',
  validate(rejectExecutionSchema),
  automationController.rejectExecution.bind(automationController),
);

// Compatibility route bindings for frontend integrations & tasks
router.get('/integrations', async (_req, res) => {
  res.status(200).json({ success: true, data: [] });
});
router.patch('/integrations/:id', async (req, res) => {
  res.status(200).json({
    success: true,
    data: { id: req.params.id, isConnected: Boolean(req.body.isConnected), status: 'Active' },
  });
});

export const moduleAutomationRoutes: Router = router;
export { router as automationRouter };
