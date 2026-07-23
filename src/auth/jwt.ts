import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
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
    return jwt.sign(payload, securityConfig.jwt.secret, {
      expiresIn: securityConfig.jwt.expiresIn,
      ...options,
    });
  }

  /**
   * Generates a signed Refresh Token.
   */
  public static signRefreshToken(payload: { id: string }, options?: SignOptions): string {
    return jwt.sign(payload, securityConfig.jwt.refreshSecret, {
      expiresIn: securityConfig.jwt.refreshExpiresIn,
      ...options,
    });
  }

  /**
   * Verifies and decodes an Access Token.
   */
  public static verifyAccessToken<T = TokenPayload>(token: string, options?: VerifyOptions): T {
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
  public static verifyRefreshToken<T = { id: string }>(token: string, options?: VerifyOptions): T {
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