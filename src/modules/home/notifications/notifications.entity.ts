export interface NotificationItemEntity {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsEntity {
  notifications: NotificationItemEntity[];
  unreadCount: number;
}
