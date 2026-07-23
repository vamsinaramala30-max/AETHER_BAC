import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validation.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { strictRateLimiter } from '../../middleware/rateLimit.middleware';
import { registerSchema, loginSchema, refreshTokenSchema } from './auth.validator';

const router = Router();

router.post('/register', strictRateLimiter, validate(registerSchema), authController.register);
router.post('/login', strictRateLimiter, validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getProfile);

export const authModuleRoutes = router;