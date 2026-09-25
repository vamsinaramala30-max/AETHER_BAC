import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';

import { AuthRepository } from './auth.repository';
import { securityConfig, logger } from '../../config';

import { db } from '../../database/client';
import { AppError } from '../../middleware/error.middleware';

import { AuthTokenPayload, LoginResponse, OAuthUserPayload, GoogleUserPayload } from './auth.types';

interface ProfileUserPayload {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  company?: string | null;
  timezone?: string | null;
  language?: string | null;
  role?: string;
  isEmailVerified?: boolean;
}

export class AuthService {
  private repo: AuthRepository;

  constructor() {
    this.repo = new AuthRepository();
  }

  /**
   * ------------------------------------------------------------------------
   * Build profile payload
   * ------------------------------------------------------------------------
   */
  private buildProfilePayload(user: ProfileUserPayload) {
    const fallbackName = user.email.split('@')[0]?.trim() || 'User';

    const fullName = user.fullName?.trim() || fallbackName;

    const parts = fullName.split(/\s+/).filter(Boolean);

    const firstName = parts[0] || '';

    const lastName = parts.slice(1).join(' ') || '';

    return {
      id: user.id,

      email: user.email.toLowerCase(),

      fullName,

      firstName,

      lastName,

      name: fullName || fallbackName,

      role: user.role || 'USER',

      avatarUrl: user.avatarUrl || null,

      bio: user.bio || null,

      company: user.company || null,

      timezone: user.timezone || 'UTC',

      language: user.language || 'en',

      isEmailVerified: Boolean(user.isEmailVerified),
    };
  }

  /**
   * ------------------------------------------------------------------------
   * Register
   * ------------------------------------------------------------------------
   */
  public async register(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<LoginResponse> {
    const email = payload.email.trim().toLowerCase();

    const existing = await this.repo.findUserByEmail(email);

    if (existing) {
      throw new AppError('An account with this email already exists', 409, 'USER_EXISTS');
    }

    const hashedPassword = await bcrypt.hash(payload.password, securityConfig.bcrypt.saltRounds);

    const fullName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim();

    const user = await this.repo.createUser({
      email,
      passwordHash: hashedPassword,
      fullName: fullName || email.split('@')[0],
    });

    if (!user) {
      throw new AppError('Failed to create user', 500, 'USER_CREATION_FAILED');
    }

    await db.notification.create({
      data: {
        userId: user.id,
        title: 'Welcome aboard',
        message: 'Your AETHER workspace is ready. Start by creating your first project or task.',
        type: 'SYSTEM',
      },
    });

    return this.generateAuthResponse(user);
  }

  /**
   * ------------------------------------------------------------------------
   * Get profile
   * ------------------------------------------------------------------------
   */
  public async getProfile(userId: string) {
    const user = await this.repo.findUserById(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return this.buildProfilePayload(user);
  }

  /**
   * ------------------------------------------------------------------------
   * Login
   * ------------------------------------------------------------------------
   */
  public async login(payload: { email: string; password: string }): Promise<LoginResponse> {
    const email = payload.email.trim().toLowerCase();

    const user = await this.repo.findUserByEmail(email);

    if (!user) {
      throw new AppError('Invalid email or password credentials', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.passwordHash) {
      throw new AppError('Account has no password set. Use OAuth login.', 401, 'OAUTH_ACCOUNT');
    }

    const isMatch = await bcrypt.compare(payload.password, user.passwordHash);

    if (!isMatch) {
      throw new AppError('Invalid email or password credentials', 401, 'INVALID_CREDENTIALS');
    }

    await db.notification.create({
      data: {
        userId: user.id,
        title: 'Sign-in detected',
        message: 'You signed in successfully to your AETHER account.',
        type: 'SECURITY',
      },
    });

    return this.generateAuthResponse(user);
  }

  /**
   * ------------------------------------------------------------------------
   * Refresh token
   * ------------------------------------------------------------------------
   */
  public async refresh(refreshToken: string): Promise<LoginResponse> {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      throw new AppError('Refresh token is required', 400, 'REFRESH_TOKEN_REQUIRED');
    }

    const trimmedToken = refreshToken.trim();

    // Verify JWT cryptographic signature if token is formatted as JWT
    try {
      jwt.verify(trimmedToken, securityConfig.jwt.refreshSecret);
    } catch (err: unknown) {
      if (err instanceof jwt.TokenExpiredError) {
        await this.repo.deleteSessionByToken(trimmedToken).catch(() => null);
        throw new AppError('Refresh token is expired', 401, 'INVALID_REFRESH_TOKEN');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid refresh token signature', 401, 'INVALID_REFRESH_TOKEN');
      }
    }

    const session = await this.repo.findSessionByToken(trimmedToken);

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.repo.deleteSessionByToken(trimmedToken).catch(() => null);
      }

      throw new AppError('Refresh token is expired or invalid', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Delete previous session (token rotation)
    await this.repo.deleteSessionByToken(trimmedToken).catch(() => null);

    const sessionUser = (session as any)?.user;
    if (!sessionUser) {
      throw new AppError('Session user information is missing', 401, 'INVALID_REFRESH_TOKEN');
    }

    const user = await this.repo.findUserById(sessionUser.id);
    if (!user) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }

    return this.generateAuthResponse(user);
  }

  /**
   * ------------------------------------------------------------------------
   * Logout
   * ------------------------------------------------------------------------
   */
  public async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      await this.repo.deleteSessionByToken(refreshToken);
    } catch (error) {
      logger.info('Session cleanup during logout failed or token was already deleted.');
    }
  }

  /**
   * ------------------------------------------------------------------------
   * Find user by ID
   * ------------------------------------------------------------------------
   */
  public async findUserById(id: string) {
    return this.repo.findUserById(id);
  }

  /**
   * ------------------------------------------------------------------------
   * Google user compatibility method
   * ------------------------------------------------------------------------
   */
  public async findOrCreateGoogleUser(payload: GoogleUserPayload) {
    return this.findOrCreateOAuthUser({
      provider: 'google',
      providerAccountId: payload.googleId,
      email: payload.email,
      fullName: payload.fullName,
      avatarUrl: payload.avatarUrl,
    });
  }

  /**
   * ------------------------------------------------------------------------
   * Find or create OAuth user
   *
   * IMPORTANT:
   * Returns the actual database user.
   *
   * Passport needs a user object here.
   * JWT generation happens later in the controller.
   * ------------------------------------------------------------------------
   */
  public async findOrCreateOAuthUser(payload: OAuthUserPayload) {
    const email = payload.email.trim().toLowerCase();

    if (!email) {
      throw new AppError(
        'OAuth provider did not return an email address',
        400,
        'OAUTH_EMAIL_MISSING',
      );
    }

    if (!payload.providerAccountId) {
      throw new AppError('OAuth provider account ID is missing', 400, 'OAUTH_ACCOUNT_ID_MISSING');
    }

    /**
     * 1. Check existing OAuth account.
     */
    const existingOAuth = await this.repo.findOAuthAccount(
      payload.provider,
      payload.providerAccountId,
    );

    if (existingOAuth) {
      const existingUser = await this.repo.findUserById(existingOAuth.userId);

      if (!existingUser) {
        throw new AppError('User not found for OAuth account', 404, 'USER_NOT_FOUND');
      }

      logger.info(`Existing OAuth user found: ${email}`);

      return existingUser;
    }

    /**
     * 2. Check existing user by email.
     */
    let user = await this.repo.findUserByEmail(email);

    /**
     * 3. Create user if necessary.
     */
    if (!user) {
      user = await this.repo.createUser({
        email,
        fullName: payload.fullName?.trim() || email.split('@')[0],
        avatarUrl: payload.avatarUrl || undefined,
        isEmailVerified: true,
      });
    }

    if (!user) {
      throw new AppError('Failed to create or find OAuth user', 500, 'USER_CREATION_FAILED');
    }

    /**
     * 4. Link OAuth account.
     *
     * The second lookup prevents a duplicate
     * OAuth record in case the user already became
     * linked between the first lookup and this point.
     */
    const linkedAccount = await this.repo.findOAuthAccount(
      payload.provider,
      payload.providerAccountId,
    );

    if (!linkedAccount) {
      await this.repo.createOAuthAccount({
        provider: payload.provider,

        providerAccountId: payload.providerAccountId,

        user: {
          connect: {
            id: user.id,
          },
        },
      });
    }

    logger.info(`OAuth user ready: ${email}`);

    /**
     * Return the actual user.
     */
    return user;
  }

  /**
   * ------------------------------------------------------------------------
   * Generate authentication response
   * ------------------------------------------------------------------------
   */
  public async generateAuthResponse(user: {
    id: string;
    email: string;
    fullName?: string | null;
    role: string;
    avatarUrl?: string | null;
  }): Promise<LoginResponse> {
    /**
     * Reload complete user from database.
     */
    const fullUser = await this.repo.findUserById(user.id);

    if (!fullUser) {
      throw new AppError(
        'User not found while generating authentication response',
        404,
        'USER_NOT_FOUND',
      );
    }

    /**
     * Ensure workspace and settings exist.
     */
    const workspaceId = await this.repo.ensureUserWorkspaceAndSettings(fullUser);

    /**
     * Build profile.
     */
    const profile = this.buildProfilePayload(fullUser);

    /**
     * JWT access-token payload.
     */
    const payload: AuthTokenPayload = {
      id: fullUser.id,
      email: fullUser.email,
      role: fullUser.role || 'USER',
      workspaceId,
    };

    /**
     * Access token.
     */
    const signOptions: SignOptions = {
      expiresIn: securityConfig.jwt.expiresIn as SignOptions['expiresIn'],
    };

    const accessToken = jwt.sign(payload, securityConfig.jwt.secret, signOptions);

    /**
     * Refresh token.
     */
    const refreshSignOptions: SignOptions = {
      expiresIn: securityConfig.jwt.refreshExpiresIn as SignOptions['expiresIn'],
    };

    const refreshToken = jwt.sign(
      {
        id: fullUser.id,
      },
      securityConfig.jwt.refreshSecret,
      refreshSignOptions,
    );

    /**
     * Session expiry.
     */
    const expiresAt = new Date();

    expiresAt.setDate(expiresAt.getDate() + 30);

    /**
     * Store refresh session.
     */
    await this.repo.createSession({
      refreshToken,
      expiresAt,
      user: {
        connect: {
          id: fullUser.id,
        },
      },
    });

    const fullName = profile.fullName || fullUser.fullName || fullUser.email.split('@')[0];

    const nameParts = fullName.split(/\s+/).filter(Boolean);

    const firstName = profile.firstName || nameParts[0] || '';

    const lastName = profile.lastName || nameParts.slice(1).join(' ') || '';

    return {
      user: {
        id: profile.id || fullUser.id,

        email: profile.email || fullUser.email,

        firstName,

        lastName,

        fullName,

        name: profile.name || fullName,

        role: profile.role || fullUser.role || 'USER',

        avatarUrl: profile.avatarUrl || fullUser.avatarUrl || null,

        bio: profile.bio || null,

        company: profile.company || null,

        timezone: profile.timezone || 'UTC',

        language: profile.language || 'en',

        isEmailVerified: Boolean(profile.isEmailVerified),

        workspaceId,
      },

      tokens: {
        accessToken,

        refreshToken,

        expiresIn: securityConfig.jwt.expiresIn,
      },
    };
  }

  /**
   * ------------------------------------------------------------------------
   * Update user profile
   * ------------------------------------------------------------------------
   */
  public async updateUserProfile(userId: string, data: any) {
    const updateData: any = {};

    if (data.fullName !== undefined) {
      updateData.fullName = String(data.fullName).trim();
    } else if (data.firstName !== undefined || data.lastName !== undefined) {
      const first = data.firstName || '';

      const last = data.lastName || '';

      updateData.fullName = `${first} ${last}`.trim();
    }

    if (data.email) {
      updateData.email = String(data.email).trim().toLowerCase();
    }

    if (data.avatarUrl || data.avatar) {
      updateData.avatarUrl = data.avatarUrl || data.avatar;
    }

    if (data.bio !== undefined) {
      updateData.bio = data.bio;
    }

    if (data.company !== undefined) {
      updateData.company = data.company;
    }

    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }

    if (data.timezone !== undefined) {
      updateData.timezone = data.timezone;
    }

    if (data.language !== undefined) {
      updateData.language = data.language;
    }

    return this.repo.updateUser(userId, updateData);
  }
}
