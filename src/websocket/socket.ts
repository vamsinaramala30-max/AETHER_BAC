import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { SocketServer } from './socketServer';
import { SOCKET_ROOMS } from './socketEvents';
import { logger } from '../config';

export const initWebSocketServer = (httpServer: HttpServer): Server => {
  return SocketServer.getInstance().initialize(httpServer);
};

export const getIO = (): Server => {
  return SocketServer.getInstance().getIO();
};
export const getIo = getIO;

export const setIoInstance = (io: Server): void => {
  SocketServer.getInstance().setIO(io);
};

export const emitToWorkspace = (workspaceId: string, event: string, payload: any): void => {
  try {
    const io = getIO();
    const room = SOCKET_ROOMS.workspace(workspaceId);
    io.to(room).emit(event, payload);
    logger.debug(`[Realtime] Emitted ${event} to ${room}`);
  } catch (err: any) {
    // Graceful when socket not initialized (e.g. offline tests)
    logger.debug(`[Realtime] Skipped emitting ${event} to workspace ${workspaceId}: ${err?.message}`);
  }
};

export const emitToUser = (userId: string, event: string, payload: any): void => {
  try {
    const io = getIO();
    const room = SOCKET_ROOMS.user(userId);
    io.to(room).emit(event, payload);
    logger.debug(`[Realtime] Emitted ${event} to ${room}`);
  } catch (err: any) {
    logger.debug(`[Realtime] Skipped emitting ${event} to user ${userId}: ${err?.message}`);
  }
};

export const emitToProject = (projectId: string, event: string, payload: any): void => {
  try {
    const io = getIO();
    const room = SOCKET_ROOMS.project(projectId);
    io.to(room).emit(event, payload);
    logger.debug(`[Realtime] Emitted ${event} to ${room}`);
  } catch (err: any) {
    logger.debug(`[Realtime] Skipped emitting ${event} to project ${projectId}: ${err?.message}`);
  }
};

