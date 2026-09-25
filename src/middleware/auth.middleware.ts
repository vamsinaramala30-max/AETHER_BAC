import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { securityConfig, logger } from '../config';
import { db } from '../database/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  workspaceId?: string;
}

const isValidUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val));

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: string;
      fullName?: string | null;
      avatarUrl?: string | null;
      workspaceId?: string;
    }
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware enforcing JWT Authentication.
 * Expects Bearer token in the 'Authorization' header.
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access denied. Missing or malformed authorization token.',
        },
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access denied. Missing token value.',
        },
      });
      return;
    }

    const decoded = jwt.verify(token, securityConfig.jwt.secret) as AuthenticatedUser;
    req.user = decoded;

    // Workspace membership validation (SEC-08)
    const workspaceHeader = req.headers['x-workspace-id'];
    if (workspaceHeader && typeof workspaceHeader === 'string') {
      if (!isValidUuid(workspaceHeader)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WORKSPACE_ID',
            message: 'Invalid workspace ID format.',
          },
        });
        return;
      }

      if (isValidUuid(req.user.id) && db && typeof (db as any).workspaceMember?.findFirst === 'function') {
        const membership = await (db as any).workspaceMember.findFirst({
          where: {
            workspaceId: workspaceHeader,
            userId: req.user.id,
          },
        });

        if (!membership) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN_WORKSPACE',
              message: 'Access denied. You are not a member of the requested workspace.',
            },
          });
          return;
        }
      }

      req.user.workspaceId = workspaceHeader;
    }

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired.',
        },
      });
      return;
    }

    logger.warn(`JWT verification failed: ${(error as Error).message}`);
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authorization token.',
      },
    });
  }
};

/**
 * Middleware providing optional JWT Authentication.
 * If Bearer token is present and valid, attaches decoded user to req.user.
 * Otherwise, assigns a default anonymous user context.
 */
export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = {
        id: 'anonymous-user',
        email: 'guest@aether.local',
        role: 'user',
        fullName: 'Anonymous User',
      };
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      req.user = {
        id: 'anonymous-user',
        email: 'guest@aether.local',
        role: 'user',
        fullName: 'Anonymous User',
      };
      return next();
    }

    const decoded = jwt.verify(token, securityConfig.jwt.secret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch {
    req.user = {
      id: 'anonymous-user',
      email: 'guest@aether.local',
      role: 'user',
      fullName: 'Anonymous User',
    };
    next();
  }
};
