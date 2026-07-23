import { OAuth2Client } from 'google-auth-library';
import { env, logger } from '../config';

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export class OAuthService {
  private static googleClient = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_CALLBACK_URL
  );

  /**
   * Generates Google OAuth URL for frontend redirection.
   */
  public static getGoogleAuthUrl(state?: string): string {
    return OAuthService.googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      prompt: 'consent',
      state,
    });
  }

  /**
   * Verifies Google ID Token returned by frontend or OAuth callback.
   */
  public static async verifyGoogleIdToken(idToken: string): Promise<GoogleUserProfile> {
    try {
      const ticket = await OAuthService.googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new Error('Invalid token payload or missing email attribute.');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified ?? false,
        firstName: payload.given_name || '',
        lastName: payload.family_name || '',
        avatarUrl: payload.picture,
      };
    } catch (error) {
      logger.error('Failed to verify Google ID token:', error);
      throw new Error('Google OAuth token validation failed.');
    }
  }
}