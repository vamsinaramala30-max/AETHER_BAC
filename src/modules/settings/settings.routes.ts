import { Router } from 'express';
import { settingsController } from './settings.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import { updateSettingsSchema } from './settings.validator';

const router = Router();

router.use(authenticate);
router.get('/', settingsController.getSettings);
router.put('/', validate(updateSettingsSchema), settingsController.updateSettings);

export const settingsModuleRoutes: Router = router;
