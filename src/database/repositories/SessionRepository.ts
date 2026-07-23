import { Session, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class SessionRepository extends PrismaService {
  public async findByToken(refreshToken: string, tx?: TransactionClient): Promise<Session | null> {
    const client = tx || this.prisma;
    return client.session.findUnique({
      where: { refreshToken },
    });
  }

  public async create(data: Prisma.SessionCreateInput, tx?: TransactionClient): Promise<Session> {
    const client = tx || this.prisma;
    return client.session.create({
      data,
    });
  }

  public async deleteByToken(refreshToken: string, tx?: TransactionClient): Promise<Session> {
    const client = tx || this.prisma;
    return client.session.delete({
      where: { refreshToken },
    });
  }

  public async deleteAllUserSessions(userId: string, tx?: TransactionClient): Promise<Prisma.BatchPayload> {
    const client = tx || this.prisma;
    return client.session.deleteMany({
      where: { userId },
    });
  }
}