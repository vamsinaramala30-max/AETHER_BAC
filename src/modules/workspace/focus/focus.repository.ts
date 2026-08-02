import { FocusSessionEntity } from './focus.entity';

export class FocusRepository {
  private sessions: Map<string, FocusSessionEntity> = new Map();

  async create(userId: string, entity: FocusSessionEntity): Promise<FocusSessionEntity> {
    this.sessions.set(entity.id, entity);
    return entity;
  }

  async findById(id: string): Promise<FocusSessionEntity | null> {
    return this.sessions.get(id) || null;
  }

  async update(entity: FocusSessionEntity): Promise<FocusSessionEntity> {
    this.sessions.set(entity.id, entity);
    return entity;
  }

  async findByUser(workspaceId: string, userId: string): Promise<FocusSessionEntity[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.workspaceId === workspaceId && s.userId === userId,
    );
  }
}
