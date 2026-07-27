import { PrismaClient, Prisma } from '@prisma/client';
import { db } from './client';

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class PrismaService {
  protected prisma: PrismaClient = db;

  /**
   * Executes a transaction block with a managed isolation level and timeout.
   */
  public async transaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<T> {
    return this.prisma.$transaction(fn, options);
  }

  /**
   * Healthcheck helper verifying DB connection status.
   */
  public async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

export { db as prisma };
