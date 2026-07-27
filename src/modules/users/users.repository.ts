import { User, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma';

export class UsersRepository extends PrismaService {
  public async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  public async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  public async delete(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }

  public async findAllPaginated(skip: number, take: number) {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count(),
    ]);
    return { users, total };
  }
}
