import jwt from 'jsonwebtoken';
import { securityConfig, logger } from '../config';
import { AuthenticatedSocket, AuthenticatedSocketUser } from './socketTypes';

export const socketAuthMiddleware = (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void,
): void => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn(`WebSocket auth failed: Missing token for socket ${socket.id}`);
      return next(new Error('Authentication error: Missing authorization token'));
    }

    const decoded = jwt.verify(token, securityConfig.jwt.secret) as AuthenticatedSocketUser;

    const workspaceId = socket.handshake.query?.workspaceId as string | undefined;

    socket.user = {
      ...decoded,
      workspaceId: workspaceId || decoded.workspaceId,
    };

    next();
  } catch (error) {
    logger.warn(
      `WebSocket authentication failed for socket ${socket.id}: ${(error as Error).message}`,
    );
    next(new Error('Authentication error: Invalid authorization token'));
  }
};
