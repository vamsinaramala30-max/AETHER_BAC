import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthService } from './auth.service';
import { env, logger } from '../../config';

const authService = new AuthService();

export class AuthController {
  /**
   * Register a new user.
   */
  public async register(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await authService.register(req.body);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Login with email/password.
   */
  public async login(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await authService.login(req.body);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Refresh access token.
   */
  public async refreshToken(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await authService.refresh(req.body.refreshToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Logout.
   */
  public async logout(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.body.refreshToken) {
        await authService.logout(req.body.refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Successfully logged out',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get current authenticated user's profile.
   */
  public async getProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const profile = await authService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update current user's profile.
   */
  public async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      await authService.updateUserProfile(userId, req.body);

      const profile = await authService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get the configured frontend URL.
   *
   * This is intentionally read from the environment so production
   * redirects go to Vercel instead of localhost.
   */
  private getFrontendUrl(): string {
    const frontendUrl = env.FRONTEND_URL?.trim();

    if (!frontendUrl) {
      throw new Error(
        'FRONTEND_URL is not configured. Set FRONTEND_URL in the backend environment.',
      );
    }

    return frontendUrl.replace(/\/+$/, '');
  }

  /**
   * Safely create a frontend redirect URL.
   */
  private getFrontendRedirect(
    path: string,
    params?: Record<string, string>,
  ): string {
    const frontendUrl = this.getFrontendUrl();

    const url = new URL(path, `${frontendUrl}/`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return url.toString();
  }

  /**
   * Initiates Google OAuth login.
   *
   * Browser:
   * Frontend → Backend /google → Google
   */
  public googleAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!env.GOOGLE_CLIENT_ID?.trim()) {
      logger.warn(
        'Google OAuth requested but GOOGLE_CLIENT_ID is not configured.',
      );

      try {
        res.redirect(
          this.getFrontendRedirect('/login', {
            error: 'google_not_configured',
          }),
        );
      } catch (error) {
        next(error);
      }

      return;
    }

    const returnTo =
      typeof req.query.returnTo === 'string'
        ? req.query.returnTo
        : undefined;

    const state = returnTo
      ? JSON.stringify({
          returnTo,
        })
      : undefined;

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      state,
    })(req, res, next);
  }

  /**
   * Handles Google's OAuth callback.
   *
   * Google → Backend /google/callback → Frontend /auth/success
   */
  public googleCallback(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    let frontendUrl: string;

    try {
      frontendUrl = this.getFrontendUrl();
    } catch (error) {
      logger.error(
        'Google OAuth callback failed: FRONTEND_URL is not configured.',
        error,
      );

      next(error);
      return;
    }

    passport.authenticate(
      'google',
      {
        session: false,
        failureRedirect: `${frontendUrl}/login?error=oauth_failed`,
      },
      async (err: Error | null, user: any) => {
        if (err || !user) {
          logger.error(
            'Google OAuth callback error:',
            err || new Error('No user returned from Google OAuth'),
          );

          try {
            return res.redirect(
              this.getFrontendRedirect('/login', {
                error: 'oauth_failed',
              }),
            );
          } catch (redirectError) {
            return next(redirectError);
          }
        }

        try {
          const userId = user?.id || user?.user?.id;
          const email = user?.email || user?.user?.email;
          const role =
            user?.role ||
            user?.user?.role ||
            'USER';

          const fullName =
            user?.fullName ||
            user?.user?.fullName ||
            `${user?.user?.firstName || ''} ${
              user?.user?.lastName || ''
            }`.trim();

          const avatarUrl =
            user?.avatarUrl ||
            user?.user?.avatarUrl ||
            undefined;

          if (!userId || !email) {
            throw new Error(
              'Google OAuth succeeded but the authenticated user data is incomplete.',
            );
          }

          /**
           * Reuse an existing access token when the OAuth strategy
           * already generated one. Otherwise generate the normal
           * application authentication response.
           */
          const token =
            user?.tokens?.accessToken ||
            (
              await authService.generateAuthResponse({
                id: userId,
                email,
                role,
                fullName: fullName || email.split('@')[0],
                avatarUrl,
              })
            ).tokens.accessToken;

          const redirectUrl = this.getFrontendRedirect(
            '/auth/success',
            {
              token,
            },
          );

          logger.info(
            'Google OAuth authentication successful. Redirecting to frontend.',
          );

          return res.redirect(redirectUrl);
        } catch (error) {
          logger.error(
            'Failed to generate auth response after Google callback:',
            error,
          );

          try {
            return res.redirect(
              this.getFrontendRedirect('/login', {
                error: 'token_generation_failed',
              }),
            );
          } catch (redirectError) {
            return next(redirectError);
          }
        }
      },
    )(req, res, next);
  }
}

export const authController = new AuthController();