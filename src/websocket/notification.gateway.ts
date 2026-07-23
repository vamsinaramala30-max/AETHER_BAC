import { Server } from 'socket.io';
import { SOCKET_ROOMS } from './socketEvents';
import { SocketEvent } from './socketTypes';

export class NotificationGateway {
  /**
   * Broadcasts a direct real-time notification to a specific connected user.
   */
  public sendNotificationToUser(
    io: Server,
    userId: string,
    notificationData: { id: string; title: string; message: string }
  ): void {
    const userRoom = SOCKET_ROOMS.user(userId);
    io.to(userRoom).emit(SocketEvent.NOTIFICATION_NEW, notificationData);
  }
}