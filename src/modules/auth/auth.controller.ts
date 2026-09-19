import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthService } from './auth.service';
import { env, logger } from '../../config';

const authService = new AuthService();

/**
 * Safely obtain configured frontend URL with production fallback.
 */
const getFrontendUrl = (): string => {
  const frontendUrl = env.FRONTEND_URL?.trim() || 'https://aether-fro-lime.vercel.app';
  return frontendUrl.replace(/\/+$/, '');
};

/**
 * Safely create a frontend redirect URL.
 */
const getFrontendRedirect = (path: string, params?: Record<string, string>): string => {
  const frontendUrl = getFrontendUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalizedPath, `${frontendUrl}/`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
};

export class AuthController {
  /**
   * Register a new user.
   */
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Registration failed:', error);
      next(error);
    }
  }

  /**
   * Login with email/password.
   */
  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Login failed:', error);
      next(error);
    }
  }

  /**
   * Refresh access token.
   */
  public async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.body?.refreshToken;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_REQUIRED',
            message: 'Refresh token is required.',
          },
        });
        return;
      }

      const result = await authService.refresh(refreshToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Token refresh failed:', error);
      next(error);
    }
  }

  /**
   * Logout.
   */
  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.body?.refreshToken;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Successfully logged out',
      });
    } catch (error) {
      logger.error('Logout failed:', error);
      next(error);
    }
  }

  /**
   * Get current authenticated user's profile.
   */
  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const profile = await authService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      logger.error('Get profile failed:', error);
      next(error);
    }
  }

  /**
   * Update current user's profile.
   */
  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      await authService.updateUserProfile(userId, req.body);

      const profile = await authService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      logger.error('Update profile failed:', error);
      next(error);
    }
  }

  constructor() {
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
    this.logout = this.logout.bind(this);
    this.getProfile = this.getProfile.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
    this.googleAuth = this.googleAuth.bind(this);
    this.googleCallback = this.googleCallback.bind(this);
  }

  /**
   * Start Google OAuth.
   *
   * GET /api/v1/auth/google
   */
  public googleAuth = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const clientId = env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

      if (!clientId || !clientSecret) {
        logger.error(
          'Google OAuth is not configured. GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.',
        );

        return res.redirect(
          getFrontendRedirect('/login', {
            error: 'google_not_configured',
          }),
        );
      }

      logger.info('Starting Google OAuth authentication.');

      passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
      })(req, res, next);
    } catch (error) {
      logger.error('Google OAuth initialization failed:', error);
      next(error);
    }
  };

  /**
   * Google OAuth callback.
   *
   * GET /api/v1/auth/google/callback
   */
  public googleCallback = (req: Request, res: Response, next: NextFunction): void => {
    passport.authenticate(
      'google',
      {
        session: false,
      },
      async (error: any, user: any): Promise<void> => {
        /**
         * Passport strategy error.
         */
        if (error) {
          logger.error('Google OAuth strategy failed:', error);

          try {
            return res.redirect(
              getFrontendRedirect('/login', {
                error: 'oauth_failed',
              }),
            );
          } catch (redirectError) {
            return next(redirectError);
          }
        }

        /**
         * Passport returned no user.
         */
        if (!user) {
          logger.error('Google OAuth returned no authenticated user.');

          try {
            return res.redirect(
              getFrontendRedirect('/login', {
                error: 'oauth_user_missing',
              }),
            );
          } catch (redirectError) {
            return next(redirectError);
          }
        }

        try {
          /**
           * Resolve user details whether user is raw DB User or LoginResponse wrapper.
           */
          const rawUser = user?.user || user;
          const userId = rawUser?.id;
          const email = rawUser?.email;
          const role = rawUser?.role || 'USER';
          const fullName =
            rawUser?.fullName ||
            rawUser?.name ||
            `${rawUser?.firstName || ''} ${rawUser?.lastName || ''}`.trim() ||
            email?.split('@')[0];
          const avatarUrl = rawUser?.avatarUrl || undefined;

          if (!userId || !email) {
            throw new Error('Google OAuth succeeded but user identity is incomplete.');
          }

          /**
           * Use existing accessToken if already generated, otherwise generate now.
           */
          let token: string | undefined = user?.tokens?.accessToken;
          if (!token) {
            const authResponse = await authService.generateAuthResponse({
              id: userId,
              email,
              fullName,
              role,
              avatarUrl,
            });
            token = authResponse.tokens.accessToken;
          }

          if (!token) {
            throw new Error('Authentication succeeded but no access token was generated.');
          }

          logger.info(`Google OAuth successful for ${email}.`);

          /**
           * Redirect to frontend authentication success page.
           */
          const redirectUrl = getFrontendRedirect('/auth/success', {
            token,
          });

          return res.redirect(redirectUrl);
        } catch (authError) {
          logger.error('Failed to generate authentication response after Google OAuth:', authError);

          try {
            return res.redirect(
              getFrontendRedirect('/login', {
                error: 'token_generation_failed',
              }),
            );
          } catch (redirectError) {
            return next(redirectError);
          }
        }
      },
    )(req, res, next);
  };
}

export const authController = new AuthController();
