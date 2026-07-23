import { NotificationRepository } from './notification.repository';

export class NotificationService {
  private repo: NotificationRepository;

  constructor() {
    this.repo = new NotificationRepository();
  }

  public async getUserNotifications(userId: string) {
    return this.repo.getUserNotifications(userId);
  }

  public async markAsRead(id: string) {
    return this.repo.markAsRead(id);
  }

  public async markAllAsRead(userId: string) {
    return this.repo.markAllAsRead(userId);
  }
}