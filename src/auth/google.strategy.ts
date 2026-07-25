import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { env, logger } from '../config';
import { AuthService } from '../modules/auth/auth.service';

/**
 * Google OAuth2 Strategy configuration for Passport.js.
 * Handles user lookup/creation and returns the user + tokens.
 */
export const createGoogleStrategy = (): GoogleStrategy => {
  return new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      scope: ['profile', 'email'],
      passReqToCallback: true,
    },
    async (
      _req: Express.Request,
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: VerifyCallback
    ) => {
      try {
        if (!profile.emails || profile.emails.length === 0) {
          return done(new Error('No email found in Google profile'), undefined);
        }

        const authService = new AuthService();
        const email = profile.emails[0].value;
        const fullName = profile.displayName || 
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
        const avatarUrl = profile.photos?.[0]?.value || null;
        const googleId = profile.id;

        const result = await authService.findOrCreateGoogleUser({
          googleId,
          email,
          fullName: fullName || email.split('@')[0],
          avatarUrl,
        });

        return done(null, result as any);
      } catch (err) {
        logger.error('Google OAuth Strategy Error:', err);
        return done(err as Error, undefined);
      }
    }
  );
};

