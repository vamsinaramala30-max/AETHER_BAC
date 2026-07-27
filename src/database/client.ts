import { PrismaClient } from '@prisma/client';
import { databaseConfig, logger } from '../config';

declare global {
  // Prevent multiple instances of Prisma Client in development/HMR

  var __prismaClientInstance: PrismaClient | undefined;
}

class DatabaseClient {
  private static instance: PrismaClient;

  private constructor() {}

  public static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      if (process.env.NODE_ENV === 'production') {
        DatabaseClient.instance = DatabaseClient.createPrismaClient();
      } else {
        if (!global.__prismaClientInstance) {
          global.__prismaClientInstance = DatabaseClient.createPrismaClient();
        }
        DatabaseClient.instance = global.__prismaClientInstance;
      }
    }
    return DatabaseClient.instance;
  }

  private static createPrismaClient(): PrismaClient {
    const client = new PrismaClient({
      datasources: {
        db: {
          url: databaseConfig.url,
        },
      },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    if (process.env.NODE_ENV === 'development') {
      // Log slow queries (>100ms) or standard queries in dev mode
      client.$on('query' as never, (e: { query: string; duration: number }) => {
        if (e.duration > 100) {
          logger.warn(`[Slow Query ${e.duration}ms]: ${e.query}`);
        } else {
          logger.debug(`[Prisma Query ${e.duration}ms]: ${e.query}`);
        }
      });
    }

    client.$on('error' as never, (e: { message: string }) => {
      logger.error(`Prisma Error: ${e.message}`);
    });

    client.$on('warn' as never, (e: { message: string }) => {
      logger.warn(`Prisma Warning: ${e.message}`);
    });

    return client;
  }

  public static async connect(): Promise<void> {
    try {
      const prisma = DatabaseClient.getInstance();
      await prisma.$connect();
      logger.info('Database client connected successfully.');
    } catch (error) {
      logger.error('Failed to connect to the database:', error);
      throw error;
    }
  }

  public static async disconnect(): Promise<void> {
    if (DatabaseClient.instance) {
      await DatabaseClient.instance.$disconnect();
      logger.info('Database client disconnected.');
    }
  }
}

export const db = DatabaseClient.getInstance();
export const connectDatabase = DatabaseClient.connect;
export const disconnectDatabase = DatabaseClient.disconnect;
