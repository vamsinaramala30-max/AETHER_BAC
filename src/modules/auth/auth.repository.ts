import { User, Session, OAuthAccount, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../../database/prisma';

export class AuthRepository extends PrismaService {
  public async findUserByEmail(email: string, tx?: TransactionClient): Promise<any | null> {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          take: 1,
          select: { workspaceId: true },
        },
        settings: {
          select: { id: true },
        },
      },
    });
  }

  public async findUserById(id: string, tx?: TransactionClient): Promise<any | null> {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { id },
      include: {
        memberships: {
          take: 1,
          select: { workspaceId: true },
        },
        settings: {
          select: { id: true },
        },
      },
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

  public async deleteSessionByToken(
    refreshToken: string,
    tx?: TransactionClient,
  ): Promise<Session | null> {
    const client = tx || this.prisma;
    try {
      return await client.session.delete({
        where: { refreshToken },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        return null;
      }
      throw err;
    }
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

  public async updateUser(
    id: string,
    data: Prisma.UserUpdateInput,
    tx?: TransactionClient,
  ): Promise<User> {
    const client = tx || this.prisma;
    return client.user.update({
      where: { id },
      data,
    });
  }

  public async ensureUserWorkspaceAndSettings(user: any): Promise<string> {
    const cachedWorkspaceId = user.memberships?.[0]?.workspaceId;
    const hasCachedSettings = Boolean(user.settings);

    if (cachedWorkspaceId && hasCachedSettings) {
      return cachedWorkspaceId;
    }

    const [membership, settings] = await Promise.all([
      cachedWorkspaceId
        ? Promise.resolve({ workspaceId: cachedWorkspaceId })
        : this.prisma.workspaceMember.findFirst({
            where: { userId: user.id },
          }),
      hasCachedSettings
        ? Promise.resolve({ id: 'existing' })
        : this.prisma.userSettings.findUnique({
            where: { userId: user.id },
          }),
    ]);

    let workspaceId: string;

    if (!membership) {
      const name = user.fullName || user.email.split('@')[0];
      const slug = `ws-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      const workspace = await this.prisma.workspace.create({
        data: {
          name: `${name}'s Workspace`,
          slug,
          description: 'Personal workspace',
          members: {
            create: {
              userId: user.id,
              role: 'OWNER',
            },
          },
        },
      });
      workspaceId = workspace.id;
    } else {
      workspaceId = membership.workspaceId;
    }

    if (!settings) {
      await this.prisma.userSettings.create({
        data: {
          userId: user.id,
          theme: 'dark',
          language: user.language || 'en',
          timezone: user.timezone || 'UTC',
        },
      });
    }

    return workspaceId;
  }
}
