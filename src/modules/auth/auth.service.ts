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

  private buildProfilePayload(user: ProfileUserPayload) {
    const fullName =
      user.fullName?.trim() ||
      [user.email.split('@')[0]]
        .filter(Boolean)
        .join(' ')
        .trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    return {
      id: user.id,
      email: user.email.toLowerCase(),
      fullName,
      firstName,
      lastName,
      name: fullName || user.email.split('@')[0],
      role: user.role || 'USER',
      avatarUrl: user.avatarUrl || null,
      bio: user.bio || null,
      company: user.company || null,
      timezone: user.timezone || 'UTC',
      language: user.language || 'en',
      isEmailVerified: Boolean(user.isEmailVerified),
    };
  }

  public async register(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<LoginResponse> {
    const existing = await this.repo.findUserByEmail(payload.email);
    if (existing) {
      throw new AppError('An account with this email already exists', 409, 'USER_EXISTS');
    }

    const hashedPassword = await bcrypt.hash(payload.password, securityConfig.bcrypt.saltRounds);

    const user = await this.repo.createUser({
      email: payload.email,
      passwordHash: hashedPassword,
      fullName: `${payload.firstName} ${payload.lastName}`,
    });

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

  public async getProfile(userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return this.buildProfilePayload(user);
  }

  public async login(payload: { email: string; password: string }): Promise<LoginResponse> {
    const user = await this.repo.findUserByEmail(payload.email);
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

  public async refresh(refreshToken: string): Promise<LoginResponse> {
    const session = await this.repo.findSessionByToken(refreshToken);
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.repo.deleteSessionByToken(refreshToken);
      }
      throw new AppError('Refresh token is expired or invalid', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Rotate refresh token
    const fullSession = await this.repo.findSessionByToken(refreshToken);
    if (!fullSession) {
      throw new AppError('Session not found', 401, 'INVALID_REFRESH_TOKEN');
    }

    await this.repo.deleteSessionByToken(refreshToken);

    // Fetch user directly
    const user = await this.repo.findUserByEmail((fullSession as any).user?.email || '');
    if (!user) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }
    return this.generateAuthResponse(user);
  }

  public async logout(refreshToken: string): Promise<void> {
    try {
      await this.repo.deleteSessionByToken(refreshToken);
    } catch {
      logger.info(`Session cleanup during logout failed or token already deleted.`);
    }
  }

  public async findUserById(id: string) {
    return this.repo.findUserById(id);
  }

  public async findOrCreateGoogleUser(payload: GoogleUserPayload): Promise<LoginResponse> {
    return this.findOrCreateOAuthUser({
      provider: 'google',
      providerAccountId: payload.googleId,
      email: payload.email,
      fullName: payload.fullName,
      avatarUrl: payload.avatarUrl,
    });
  }

  public async findOrCreateOAuthUser(payload: OAuthUserPayload): Promise<LoginResponse> {
    // Check if OAuth account already exists
    const existingOAuth = await this.repo.findOAuthAccount(
      payload.provider,
      payload.providerAccountId,
    );

    if (existingOAuth) {
      // User exists - return auth response
      const existingUser = await this.repo.findUserById(existingOAuth.userId);
      if (!existingUser) {
        throw new AppError('User not found for OAuth account', 404, 'USER_NOT_FOUND');
      }
      return this.generateAuthResponse(existingUser);
    }

    // Check if user already exists by email
    let user = await this.repo.findUserByEmail(payload.email);

    if (!user) {
      // Create new user
      user = await this.repo.createUser({
        email: payload.email,
        fullName: payload.fullName,
        avatarUrl: payload.avatarUrl,
        isEmailVerified: true,
      });
    }

    if (!user) {
      throw new AppError('Failed to create or find user', 500, 'USER_CREATION_FAILED');
    }

    // Create OAuth account link
    await this.repo.createOAuthAccount({
      provider: payload.provider,
      providerAccountId: payload.providerAccountId,
      user: { connect: { id: user.id } },
    });

    return this.generateAuthResponse(user);
  }

  public async generateAuthResponse(user: {
    id: string;
    email: string;
    fullName?: string | null;
    role: string;
    avatarUrl?: string | null;
  }): Promise<LoginResponse> {
    const fullUser = await this.repo.findUserById(user.id);
    const workspaceId = fullUser
      ? await this.repo.ensureUserWorkspaceAndSettings(fullUser)
      : undefined;

    const profile = fullUser ? this.buildProfilePayload(fullUser) : undefined;

    const payload: AuthTokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      workspaceId,
    };

    const signOptions: SignOptions = {
      expiresIn: securityConfig.jwt.expiresIn as string & SignOptions['expiresIn'],
    };

    const accessToken = jwt.sign(payload, securityConfig.jwt.secret, signOptions);

    const refreshToken = jwt.sign({ id: user.id }, securityConfig.jwt.refreshSecret, {
      expiresIn: securityConfig.jwt.refreshExpiresIn as string & SignOptions['expiresIn'],
    } as SignOptions);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days session persistence

    await this.repo.createSession({
      refreshToken,
      expiresAt,
      user: { connect: { id: user.id } },
    });

    const nameParts = user.fullName ? user.fullName.split(' ') : ['', ''];
    return {
      user: {
        id: profile?.id || user.id,
        email: profile?.email || user.email,
        firstName: profile?.firstName || nameParts[0] || '',
        lastName: profile?.lastName || nameParts.slice(1).join(' ') || '',
        fullName: profile?.fullName || user.fullName || `${nameParts[0] || ''} ${nameParts.slice(1).join(' ') || ''}`.trim(),
        name: profile?.name || profile?.fullName || user.fullName || `${nameParts[0] || ''} ${nameParts.slice(1).join(' ') || ''}`.trim(),
        role: profile?.role || user.role,
        avatarUrl: profile?.avatarUrl || user.avatarUrl,
        bio: profile?.bio || null,
        company: profile?.company || null,
        timezone: profile?.timezone || 'UTC',
        language: profile?.language || 'en',
        isEmailVerified: profile?.isEmailVerified || false,
        workspaceId,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: securityConfig.jwt.expiresIn,
      },
    };
  }

  public async updateUserProfile(userId: string, data: any) {
    const updateData: any = {};
    if (data.fullName) {
      updateData.fullName = data.fullName;
    } else if (data.firstName !== undefined || data.lastName !== undefined) {
      const first = data.firstName || '';
      const last = data.lastName || '';
      updateData.fullName = `${first} ${last}`.trim();
    }
    if (data.email) updateData.email = data.email.toLowerCase();
    if (data.avatarUrl || data.avatar) updateData.avatarUrl = data.avatarUrl || data.avatar;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.company !== undefined) updateData.company = data.company;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.language !== undefined) updateData.language = data.language;

    return this.repo.updateUser(userId, updateData);
  }
}
