import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { securityConfig, logger } from '../config';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  workspaceId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware enforcing JWT Authentication.
 * Expects Bearer token in the 'Authorization' header.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
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

    // Optional workspace context header binding
    const workspaceHeader = req.headers['x-workspace-id'];
    if (workspaceHeader && typeof workspaceHeader === 'string') {
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