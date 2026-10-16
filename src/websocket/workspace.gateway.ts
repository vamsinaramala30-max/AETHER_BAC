import { Server } from 'socket.io';
import { AuthenticatedSocket, SocketEvent } from './socketTypes';
import { SOCKET_ROOMS } from './socketEvents';
import { logger } from '../config';
import { db } from '../database/client';

export class WorkspaceGateway {
  public registerHandlers(_io: Server, socket: AuthenticatedSocket): void {
    socket.on(SocketEvent.JOIN_WORKSPACE, async (workspaceId: string, ack?: (res: any) => void) => {
      try {
        if (!workspaceId) {
          if (ack) ack({ error: 'Missing workspaceId' });
          return;
        }

        const userId = socket.user?.id;
        if (!userId) {
          socket.emit(SocketEvent.ERROR, {
            code: 'UNAUTHORIZED',
            message: 'User authentication missing',
          });
          if (ack) ack({ error: 'Unauthorized' });
          return;
        }

        // Database-backed membership verification
        const membership = await db.workspaceMember.findFirst({
          where: { workspaceId, userId },
        });

        if (!membership) {
          logger.warn(
            `Unauthorized socket room join attempt: User ${userId} tried to join workspace ${workspaceId}`,
          );
          socket.emit(SocketEvent.ERROR, {
            code: 'FORBIDDEN_WORKSPACE',
            message: 'Access denied: You are not a member of this workspace',
          });
          if (ack) ack({ error: 'Forbidden' });
          return;
        }

        const room = SOCKET_ROOMS.workspace(workspaceId);
        socket.join(room);
        logger.info(`Socket ${socket.id} (User: ${userId}, Role: ${membership.role}) joined ${room}`);
        if (ack) ack({ success: true, room, role: membership.role });
      } catch (err: any) {
        logger.error(`Error in JOIN_WORKSPACE handler: ${err?.message}`);
        if (ack) ack({ error: 'Internal server error' });
      }
    });

    socket.on(SocketEvent.LEAVE_WORKSPACE, (workspaceId: string, ack?: (res: any) => void) => {
      if (!workspaceId) {
        if (ack) ack({ error: 'Missing workspaceId' });
        return;
      }
      const room = SOCKET_ROOMS.workspace(workspaceId);
      socket.leave(room);
      logger.info(`Socket ${socket.id} left ${room}`);
      if (ack) ack({ success: true });
    });
  }
}

