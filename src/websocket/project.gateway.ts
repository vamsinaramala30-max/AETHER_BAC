import { Server } from 'socket.io';
import { AuthenticatedSocket, SocketEvent } from './socketTypes';
import { SOCKET_ROOMS } from './socketEvents';
import { logger } from '../config';

export class ProjectGateway {
  public registerHandlers(io: Server, socket: AuthenticatedSocket): void {
    socket.on(SocketEvent.JOIN_PROJECT, (projectId: string) => {
      if (!projectId) {
        return;
      }
      const room = SOCKET_ROOMS.project(projectId);
      socket.join(room);
      logger.info(`Socket ${socket.id} joined project room ${room}`);
    });

    socket.on(SocketEvent.LEAVE_PROJECT, (projectId: string) => {
      if (!projectId) {
        return;
      }
      const room = SOCKET_ROOMS.project(projectId);
      socket.leave(room);
      logger.info(`Socket ${socket.id} left project room ${room}`);
    });
  }
}
