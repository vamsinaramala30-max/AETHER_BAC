import { SessionRepository } from '../database/repositories/SessionRepository';
import { JWTService } from './jwt';
import { logger } from '../config';

export class SessionManager {
  private sessionRepo: SessionRepository;

  constructor() {
    this.sessionRepo = new SessionRepository();
  }

  /**
   * Creates a persistent session linked to a refresh token.
   */
  public async createSession(userId: string, refreshToken: string, ttlDays: number = 30) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    return this.sessionRepo.create({
      refreshToken,
      expiresAt,
      user: { connect: { id: userId } },
    });
  }

  /**
   * Validates session existence and verifies associated refresh token.
   */
  public async validateSession(refreshToken: string) {
    const session = await this.sessionRepo.findByToken(refreshToken);

    if (!session) {
      logger.warn('Session verification failed: Token not found in repository.');
      return null;
    }

    if (session.expiresAt < new Date()) {
      logger.warn(`Session expired for user ID: ${session.userId}. Cleaning up...`);
      await this.sessionRepo.deleteByToken(refreshToken);
      return null;
    }

    try {
      const decoded = JWTService.verifyRefreshToken(refreshToken);
      return { session, decoded };
    } catch {
      await this.sessionRepo.deleteByToken(refreshToken);
      return null;
    }
  }

  /**
   * Invalidates a specific session.
   */
  public async revokeSession(refreshToken: string): Promise<void> {
    try {
      await this.sessionRepo.deleteByToken(refreshToken);
    } catch {
      logger.debug('Attempted to revoke session that was already purged.');
    }
  }

  /**
   * Revokes all active sessions for a user (e.g., password reset / account compromise).
   */
  public async revokeAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepo.deleteAllUserSessions(userId);
  }
}