import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { env, logger } from '../config';
import { AuthService } from '../modules/auth/auth.service';
import { OAuthUserPayload } from '../modules/auth/auth.types';

/**
 * Passport.js Configuration
 *
 * Provides:
 * - Google OAuth2.0 Strategy
 * - Session serialization/deserialization
 */

// Serialize user ID into the session
passport.serializeUser((user: any, done) => {
  done(null, user.user?.id || user.id);
});

// Deserialize user from session by ID
passport.deserializeUser(async (id: string, done) => {
  try {
    const authService = new AuthService();
    const user = await authService.findUserById(id);
    done(null, user || null);
  } catch (err) {
    done(err, null);
  }
});

// Configure Google OAuth2 Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: env.GOOGLE_CALLBACK_URL || 'http://localhost:5001/api/auth/google/callback',
      scope: ['profile', 'email'],
      passReqToCallback: true,
    },
    async (
      _req: Express.Request,
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: VerifyCallback,
    ) => {
      try {
        if (!profile.emails || profile.emails.length === 0) {
          return done(new Error('No email found in Google profile'), undefined);
        }

        const authService = new AuthService();
        const email = profile.emails[0].value;
        const fullName =
          profile.displayName ||
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
        const avatarUrl = profile.photos?.[0]?.value || undefined;
        const googleId = profile.id;

        const oauthPayload: OAuthUserPayload = {
          provider: 'google',
          providerAccountId: googleId,
          email,
          fullName: fullName || email.split('@')[0],
          avatarUrl,
        };

        const result = await authService.findOrCreateOAuthUser(oauthPayload);

        return done(null, result as any);
      } catch (err) {
        logger.error('Google OAuth Strategy Error:', err);
        return done(err, undefined);
      }
    },
  ),
);

export default passport;
