import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthService } from './auth.service';
import { env, logger } from '../../config';

const authService = new AuthService();

export class AuthController {
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.refresh(req.body.refreshToken);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.body.refreshToken) {
        await authService.logout(req.body.refreshToken);
      }
      res.status(200).json({ success: true, message: 'Successfully logged out' });
    } catch (err) {
      next(err);
    }
  }

  public async getProfile(req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: req.user });
  }

  /**
   * Initiates Google OAuth login flow.
   * Redirects user to Google's consent screen.
   */
  public googleAuth(req: Request, res: Response, next: NextFunction): void {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      state: req.query.returnTo ? JSON.stringify({ returnTo: req.query.returnTo }) : undefined,
    })(req, res, next);
  }

  /**
   * Handles the Google OAuth callback.
   * On success, redirects to frontend with JWT token.
   */
  public googleCallback(req: Request, res: Response, next: NextFunction): void {
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${env.FRONTEND_URL}/login?error=oauth_failed`,
    }, async (err: Error | null, user: any) => {
      if (err || !user) {
        logger.error('Google OAuth callback error:', err);
        return res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }

      try {
        const token =
          user?.tokens?.accessToken ||
          (
            await authService.generateAuthResponse({
              id: user.id || user.user?.id,
              email: user.email || user.user?.email,
              role: user.role || user.user?.role || 'USER',
              fullName:
                user.fullName ||
                `${user.user?.firstName || ''} ${user.user?.lastName || ''}`.trim(),
              avatarUrl: user.avatarUrl || user.user?.avatarUrl,
            })
          ).tokens.accessToken;

        return res.redirect(`${env.FRONTEND_URL}/auth/success?token=${token}`);
      } catch (error) {
        logger.error('Failed to generate auth response after Google callback:', error);
        return res.redirect(`${env.FRONTEND_URL}/login?error=token_generation_failed`);
      }
    })(req, res, next);
  }
}

export const authController = new AuthController();
