import { env } from './env';

export interface AppConfig {
  name: string;
  env: 'development' | 'production' | 'test';
  port: number;
  apiPrefix: string;
  url: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

export const appConfig: AppConfig = {
  name: env.APP_NAME,
  env: env.NODE_ENV,
  port: env.PORT,
  apiPrefix: env.API_PREFIX,
  url: env.APP_URL,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
};