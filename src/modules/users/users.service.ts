import { UsersRepository } from './users.repository';
import { AppError } from '../../middleware/error.middleware';

export class UsersService {
  private repo: UsersRepository;

  constructor() {
    this.repo = new UsersRepository();
  }

  public async getUserById(id: string) {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  public async updateUser(id: string, data: { firstName?: string; lastName?: string; avatarUrl?: string }) {
    await this.getUserById(id);
    const updated = await this.repo.update(id, data);
    const { passwordHash, ...userWithoutPassword } = updated;
    return userWithoutPassword;
  }

  public async deleteUser(id: string) {
    await this.getUserById(id);
    await this.repo.delete(id);
  }

  public async listUsers(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const { users, total } = await this.repo.findAllPaginated(skip, limit);
    const sanitized = users.map(({ passwordHash, ...rest }) => rest);
    return { users: sanitized, total, page, limit };
  }
}