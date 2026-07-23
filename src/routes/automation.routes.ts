import { Router } from 'express';
import { automationController } from '../modules/automation/automation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createAutomationSchema, updateAutomationSchema } from '../validators/automation.validator';

const router = Router();

router.use(authenticate);

router.get('/', automationController.getAutomations);
router.post('/', validate(createAutomationSchema), automationController.createAutomation);
router.get('/:id', automationController.getAutomationById);
router.put('/:id', validate(updateAutomationSchema), automationController.updateAutomation);
router.delete('/:id', automationController.deleteAutomation);

export const automationRoutes = router;