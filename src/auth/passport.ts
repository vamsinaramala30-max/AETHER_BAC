import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';

import { env, logger } from '../config';
import { AuthService } from '../modules/auth/auth.service';
import { OAuthUserPayload } from '../modules/auth/auth.types';

/**
 * Passport.js configuration.
 *
 * Google OAuth is used to authenticate the user.
 *
 * The application itself uses JWT authentication,
 * therefore OAuth does not require a Passport session.
 */

const authService = new AuthService();

/**
 * --------------------------------------------------------------------------
 * Passport session serialization
 * --------------------------------------------------------------------------
 *
 * These are retained for compatibility if Passport sessions
 * are enabled elsewhere in the application.
 */

passport.serializeUser((user: any, done) => {
  try {
    const userId = user?.user?.id || user?.id;

    if (!userId) {
      return done(new Error('Unable to serialize user: user ID is missing.'));
    }

    done(null, userId);
  } catch (error) {
    done(error);
  }
});

passport.deserializeUser(async (id: string, done) => {
  try {
    if (!id) {
      done(null, false);
      return;
    }

    const user = await authService.findUserById(id);

    if (!user) {
      done(null, false);
      return;
    }

    done(null, user);
  } catch (error) {
    logger.error('Passport deserializeUser failed:', error);

    done(error);
  }
});

/**
 * --------------------------------------------------------------------------
 * Google OAuth configuration
 * --------------------------------------------------------------------------
 */

const googleClientId = env.GOOGLE_CLIENT_ID?.trim();

const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

const googleCallbackUrl = env.GOOGLE_CALLBACK_URL?.trim();

if (!googleClientId) {
  logger.warn('GOOGLE_CLIENT_ID is not configured. Google OAuth will not work.');
}

if (!googleClientSecret) {
  logger.warn('GOOGLE_CLIENT_SECRET is not configured. Google OAuth will not work.');
}

if (!googleCallbackUrl) {
  logger.warn('GOOGLE_CALLBACK_URL is not configured. Google OAuth will not work.');
}

/**
 * Register Google strategy.
 */
passport.use(
  'google',
  new GoogleStrategy(
    {
      clientID: googleClientId || 'missing-google-client-id',

      clientSecret: googleClientSecret || 'missing-google-client-secret',

      /**
       * IMPORTANT:
       *
       * Production callback:
       *
       * https://aether-bac.onrender.com/api/v1/auth/google/callback
       */
      callbackURL: googleCallbackUrl || 'http://localhost:5001/api/auth/google/callback',

      scope: ['profile', 'email'],

      /**
       * We use JWT authentication rather than
       * Passport sessions for OAuth login.
       */
      passReqToCallback: false,
    },

    async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
      try {
        /**
         * Google profile ID.
         */
        const googleId = profile.id?.trim();

        if (!googleId) {
          throw new Error('Google profile ID is missing.');
        }

        /**
         * Google email.
         */
        const email = profile.emails?.[0]?.value?.trim().toLowerCase();

        if (!email) {
          throw new Error('No email found in Google profile.');
        }

        /**
         * Full name.
         */
        const fullName =
          profile.displayName?.trim() ||
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
          email.split('@')[0];

        /**
         * Google profile picture.
         */
        const avatarUrl = profile.photos?.[0]?.value || undefined;

        /**
         * Convert Google data to the application's
         * OAuth user payload.
         */
        const oauthPayload: OAuthUserPayload = {
          provider: 'google',
          providerAccountId: googleId,
          email,
          fullName,
          avatarUrl,
        };

        logger.info(`Google OAuth profile received for ${email}.`);

        /**
         * Find existing user or create a new user.
         *
         * IMPORTANT:
         * This returns the actual database user,
         * not LoginResponse.
         */
        const user = await authService.findOrCreateOAuthUser(oauthPayload);

        if (!user) {
          throw new Error('OAuth user could not be resolved.');
        }

        logger.info(`Google OAuth user resolved successfully: ${email}.`);

        /**
         * Passport receives the database user.
         */
        return done(null, user as any);
      } catch (error) {
        logger.error('Google OAuth strategy error:', error);

        return done(
          error instanceof Error ? error : new Error('Google OAuth authentication failed.'),
          undefined,
        );
      }
    },
  ),
);

logger.info('Google OAuth Passport strategy initialized.');

export default passport;
