import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { securityConfig, logger } from '../../config';
import { AppError } from '../../middleware/error.middleware';
import { AuthTokenPayload, LoginResponse, OAuthUserPayload, GoogleUserPayload } from './auth.types';

export class AuthService {
  private repo: AuthRepository;

  constructor() {
    this.repo = new AuthRepository();
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

    return this.generateAuthResponse(user);
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
    const payload: AuthTokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
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
        id: user.id,
        email: user.email,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: securityConfig.jwt.expiresIn,
      },
    };
  }
}
