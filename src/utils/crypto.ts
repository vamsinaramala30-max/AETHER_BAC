import crypto from 'crypto';

export class CryptoUtils {
  /**
   * Generates a cryptographically strong random hex token.
   */
  public static generateRandomToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Generates a secure random 6-digit numeric OTP code.
   */
  public static generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Creates an SHA-256 hash of an input string.
   */
  public static hashString(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
}
