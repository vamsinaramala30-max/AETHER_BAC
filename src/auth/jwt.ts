import jwt, { SignOptions } from 'jsonwebtoken';
import { securityConfig, logger } from '../config';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  workspaceId?: string;
  [key: string]: unknown;
}

export class JWTService {
  /**
   * Generates a signed Access Token.
   */
  public static signAccessToken(payload: TokenPayload, options?: SignOptions): string {
    const opts: SignOptions = {
      expiresIn: securityConfig.jwt.expiresIn as string & SignOptions['expiresIn'],
      ...options,
    };
    return jwt.sign(payload, securityConfig.jwt.secret, opts);
  }

  /**
   * Generates a signed Refresh Token.
   */
  public static signRefreshToken(payload: { id: string }, options?: SignOptions): string {
    const opts: SignOptions = {
      expiresIn: securityConfig.jwt.refreshExpiresIn as string & SignOptions['expiresIn'],
      ...options,
    };
    return jwt.sign(payload, securityConfig.jwt.refreshSecret, opts);
  }

  /**
   * Verifies and decodes an Access Token.
   */
  public static verifyAccessToken<T = TokenPayload>(token: string, options?: jwt.VerifyOptions): T {
    try {
      return jwt.verify(token, securityConfig.jwt.secret, options) as T;
    } catch (error) {
      logger.debug(`AccessToken Verification Error: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Verifies and decodes a Refresh Token.
   */
  public static verifyRefreshToken<T = { id: string }>(token: string, options?: jwt.VerifyOptions): T {
    try {
      return jwt.verify(token, securityConfig.jwt.refreshSecret, options) as T;
    } catch (error) {
      logger.debug(`RefreshToken Verification Error: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Decodes a token without verifying signature (useful for inspecting expired payloads).
   */
  public static decode<T = TokenPayload>(token: string): T | null {
    return jwt.decode(token) as T | null;
  }
}
