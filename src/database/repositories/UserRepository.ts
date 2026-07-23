import { User, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class UserRepository extends PrismaService {
  /**
   * Find a user by primary key ID.
   */
  public async findById(id: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { id },
    });
  }

  /**
   * Find a user by email address.
   */
  public async findByEmail(email: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx || this.prisma;
    return client.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * Create a new user record.
   */
  public async create(data: Prisma.UserCreateInput, tx?: TransactionClient): Promise<User> {
    const client = tx || this.prisma;
    return client.user.create({
      data: {
        ...data,
        email: data.email.toLowerCase(),
      },
    });
  }

  /**
   * Update an existing user record.
   */
  public async update(id: string, data: Prisma.UserUpdateInput, tx?: TransactionClient): Promise<User> {
    const client = tx || this.prisma;
    return client.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Soft delete or hard delete user by ID.
   */
  public async delete(id: string, tx?: TransactionClient): Promise<User> {
    const client = tx || this.prisma;
    return client.user.delete({
      where: { id },
    });
  }

  /**
   * Find users with pagination and search criteria.
   */
  public async findManyPaginated(params: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<{ users: User[]; total: number }> {
    const { skip = 0, take = 20, where, orderBy } = params;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take,
        where,
        orderBy: orderBy || { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }
}