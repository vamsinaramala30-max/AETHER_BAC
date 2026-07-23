import { Server } from 'socket.io';
import { AuthenticatedSocket, SocketEvent } from './socketTypes';
import { SOCKET_ROOMS } from './socketEvents';
import { logger } from '../config';

export class WorkspaceGateway {
  public registerHandlers(io: Server, socket: AuthenticatedSocket): void {
    socket.on(SocketEvent.JOIN_WORKSPACE, (workspaceId: string) => {
      if (!workspaceId) return;
      const room = SOCKET_ROOMS.workspace(workspaceId);
      socket.join(room);
      logger.info(`Socket ${socket.id} (User: ${socket.user?.id}) joined ${room}`);
    });

    socket.on(SocketEvent.LEAVE_WORKSPACE, (workspaceId: string) => {
      if (!workspaceId) return;
      const room = SOCKET_ROOMS.workspace(workspaceId);
      socket.leave(room);
      logger.info(`Socket ${socket.id} left ${room}`);
    });
  }
}