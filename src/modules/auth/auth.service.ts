import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { securityConfig, logger } from '../../config';
import { AppError } from '../../middleware/error.middleware';
import { AuthTokenPayload, LoginResponse } from './auth.types';

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
      password: hashedPassword,
      firstName: payload.firstName,
      lastName: payload.lastName,
    });

    return this.generateAuthResponse(user);
  }

  public async login(payload: { email: string; password: string }): Promise<LoginResponse> {
    const user = await this.repo.findUserByEmail(payload.email);
    if (!user) {
      throw new AppError('Invalid email or password credentials', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(payload.password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password credentials', 401, 'INVALID_CREDENTIALS');
    }

    return this.generateAuthResponse(user);
  }

  public async refresh(refreshToken: string): Promise<LoginResponse> {
    const session = await this.repo.findSessionByToken(refreshToken);
    if (!session || session.expiresAt < new Date()) {
      if (session) await this.repo.deleteSessionByToken(refreshToken);
      throw new AppError('Refresh token is expired or invalid', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Rotate refresh token
    await this.repo.deleteSessionByToken(refreshToken);
    return this.generateAuthResponse(session.user);
  }

  public async logout(refreshToken: string): Promise<void> {
    try {
      await this.repo.deleteSessionByToken(refreshToken);
    } catch {
      logger.info(`Session cleanup during logout failed or token already deleted.`);
    }
  }

  private async generateAuthResponse(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }): Promise<LoginResponse> {
    const payload: AuthTokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, securityConfig.jwt.secret, {
      expiresIn: securityConfig.jwt.expiresIn,
    });

    const refreshToken = jwt.sign({ id: user.id }, securityConfig.jwt.refreshSecret, {
      expiresIn: securityConfig.jwt.refreshExpiresIn,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days session persistence

    await this.repo.createSession({
      refreshToken,
      expiresAt,
      user: { connect: { id: user.id } },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: securityConfig.jwt.expiresIn,
      },
    };
  }
}