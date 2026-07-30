import { User, Session, OAuthAccount, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../../database/prisma';

export class AuthRepository extends PrismaService {
  public async findUserByEmail(email: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  public async findUserById(id: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { id },
    });
  }

  public async createUser(data: Prisma.UserCreateInput, tx?: TransactionClient): Promise<User> {
    const client = tx || this.prisma;
    return client.user.create({
      data: {
        ...data,
        email: data.email.toLowerCase(),
      },
    });
  }

  public async createSession(
    data: Prisma.SessionCreateInput,
    tx?: TransactionClient,
  ): Promise<Session> {
    const client = tx || this.prisma;
    return client.session.create({ data });
  }

  public async findSessionByToken(refreshToken: string): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });
  }

  public async deleteSessionByToken(refreshToken: string): Promise<Session> {
    return this.prisma.session.delete({
      where: { refreshToken },
    });
  }

  public async findOAuthAccount(
    provider: string,
    providerAccountId: string,
    tx?: TransactionClient,
  ): Promise<OAuthAccount | null> {
    const client = tx || this.prisma;
    return client.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      include: { user: true },
    });
  }

  public async createOAuthAccount(
    data: Prisma.OAuthAccountCreateInput,
    tx?: TransactionClient,
  ): Promise<OAuthAccount> {
    const client = tx || this.prisma;
    return client.oAuthAccount.create({ data });
  }

  public async updateUser(id: string, data: Prisma.UserUpdateInput, tx?: TransactionClient): Promise<User> {
    const client = tx || this.prisma;
    return client.user.update({
      where: { id },
      data,
    });
  }
}
