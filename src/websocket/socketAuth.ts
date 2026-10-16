import jwt from 'jsonwebtoken';
import { securityConfig, logger } from '../config';
import { AuthenticatedSocket, AuthenticatedSocketUser } from './socketTypes';
import { db } from '../database/client';

export const socketAuthMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void,
): Promise<void> => {
  try {
    // Redact token from handshake query to prevent URL log exposure
    if (socket.handshake.query && typeof socket.handshake.query.token !== 'undefined') {
      delete (socket.handshake.query as any).token;
    }

    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn(`WebSocket auth failed: Missing token in handshake auth for socket ${socket.id}`);
      return next(new Error('Authentication error: Missing authorization token'));
    }

    const decoded = jwt.verify(token, securityConfig.jwt.secret) as AuthenticatedSocketUser & {
      tokenVersion?: number;
    };

    // Server-side token invalidation check
    if (decoded.id && db && typeof (db as any).user?.findUnique === 'function') {
      const userRecord = await (db as any).user.findUnique({
        where: { id: decoded.id },
        select: { tokenVersion: true },
      });

      if (!userRecord) {
        return next(new Error('Authentication error: User not found'));
      }

      if ((decoded.tokenVersion ?? 0) !== userRecord.tokenVersion) {
        return next(new Error('Authentication error: Session has been revoked'));
      }
    }

    const requestedWorkspaceId = socket.handshake.query?.workspaceId as string | undefined;
    let targetWorkspaceId = decoded.workspaceId;

    if (requestedWorkspaceId && typeof requestedWorkspaceId === 'string') {
      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestedWorkspaceId,
      );
      if (!isValidUuid) {
        logger.warn(
          `WebSocket auth rejected: Invalid workspace UUID format '${requestedWorkspaceId}' for socket ${socket.id}`,
        );
        return next(new Error('Authentication error: Invalid workspace ID format'));
      }

      if (decoded.id && db && typeof (db as any).workspaceMember?.findFirst === 'function') {
        const membership = await (db as any).workspaceMember.findFirst({
          where: {
            workspaceId: requestedWorkspaceId,
            userId: decoded.id,
          },
        });

        if (!membership) {
          logger.warn(
            `WebSocket auth rejected: User ${decoded.id} is not a member of requested workspace ${requestedWorkspaceId}`,
          );
          return next(
            new Error('Authentication error: Access denied to requested workspace'),
          );
        }
      }

      targetWorkspaceId = requestedWorkspaceId;
    }

    socket.user = {
      ...decoded,
      workspaceId: targetWorkspaceId,
    };

    next();
  } catch (error) {
    logger.warn(
      `WebSocket authentication failed for socket ${socket.id}: ${(error as Error).message}`,
    );
    next(new Error('Authentication error: Invalid authorization token'));
  }
};

