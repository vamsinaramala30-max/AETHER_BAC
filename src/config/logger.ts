import winston from 'winston';
import { env } from './env';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

export const SENSITIVE_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
  /("?(?:password|token|secret|authorization|accessToken|refreshToken|apiKey|cookie|privateKey)"?\s*[:=]\s*(?:Bearer\s+)?)(("[^"]*"|'[^']*'|[^\s,;]+))/gi,
];

export function maskLogMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '$1"[REDACTED]"');
  }
  return sanitized;
}

export const maskSensitiveData = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = maskLogMessage(info.message);
  }
  return info;
});

const format = winston.format.combine(
  maskSensitiveData(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `[${info.timestamp}] [${info.level}]: ${info.message}`),
);

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
  }),
  new winston.transports.File({ filename: 'logs/combined.log' }),
];

export const loggerConfig = {
  level: env.LOG_LEVEL,
  levels,
  format,
  transports,
};

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  levels,
  format,
  transports,
});
