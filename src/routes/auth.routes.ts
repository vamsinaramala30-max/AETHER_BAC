import { Router } from 'express';
import { authController } from '../modules/auth/auth.controller';
import { validate } from '../middleware/validation.middleware';
import { strictRateLimiter } from '../middleware/rateLimit.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { registerSchema, loginSchema, refreshTokenSchema } from '../validators/auth.validator';

const router = Router();

// Standard auth routes
router.post('/register', strictRateLimiter, validate(registerSchema), authController.register);

router.post('/login', strictRateLimiter, validate(loginSchema), authController.login);

router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);

router.post('/logout', authenticate, authController.logout);

router.get('/me', authenticate, authController.getProfile);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.patch('/profile', authenticate, authController.updateProfile);

// Google OAuth routes
router.get('/google', authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

export const authRoutes: Router = router;
