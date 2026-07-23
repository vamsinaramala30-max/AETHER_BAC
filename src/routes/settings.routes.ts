import { Router } from 'express';
import { settingsController } from '../modules/settings/settings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateSettingsSchema } from '../validators/settings.validator';

const router = Router();

router.use(authenticate);

router.get('/', settingsController.getSettings);
router.put('/', validate(updateSettingsSchema), settingsController.updateSettings);

export const settingsRoutes = router;