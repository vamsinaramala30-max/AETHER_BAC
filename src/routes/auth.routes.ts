import { Router } from 'express';
import { authController } from '../modules/auth/auth.controller';
import { validate } from '../middleware/validation.middleware';
import { strictRateLimiter } from '../middleware/rateLimit.middleware';
import { authenticate } from '../middleware/auth.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';

const router = Router();

router.post(
  '/register',
  strictRateLimiter,
  validate(registerSchema),
  authController.register
);

router.post(
  '/login',
  strictRateLimiter,
  validate(loginSchema),
  authController.login
);

router.post(
  '/refresh',
  validate(refreshTokenSchema),
  authController.refreshToken
);

router.post(
  '/logout',
  authenticate,
  authController.logout
);

router.get(
  '/me',
  authenticate,
  authController.getProfile
);

export const authRoutes = router;