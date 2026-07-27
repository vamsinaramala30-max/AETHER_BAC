import { HelmetOptions } from 'helmet';
import { env } from './env';

export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  bcrypt: {
    saltRounds: number;
  };
  session: {
    secret: string;
  };
  helmet: HelmetOptions;
}

export const securityConfig: SecurityConfig = {
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  bcrypt: {
    saltRounds: env.BCRYPT_SALT_ROUNDS,
  },
  session: {
    secret: env.SESSION_SECRET,
  },
  helmet: {
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: env.NODE_ENV === 'production',
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  },
};
