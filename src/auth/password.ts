import bcrypt from 'bcryptjs';
import { securityConfig } from '../config';

export class PasswordService {
  /**
   * Hashes a raw plain text password using bcrypt.
   */
  public static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, securityConfig.bcrypt.saltRounds);
  }

  /**
   * Compares a raw plain text password against a bcrypt hashed password.
   */
  public static async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validates strength parameters for raw input passwords.
   */
  public static isStrongPassword(password: string): boolean {
    // Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  }
}
