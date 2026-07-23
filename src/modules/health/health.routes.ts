import { Router } from 'express';
import { healthController } from './health.controller';

const router = Router();

router.get('/', healthController.checkHealth);

export const healthModuleRoutes = router;