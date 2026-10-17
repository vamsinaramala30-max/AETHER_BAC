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
  tokenVersion?: number;
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
      tokenVersion?: number;
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
    let token: string | undefined;

    // Redact token from query parameters to prevent leakage in logs, proxy caches, and referrers
    if (req.query && typeof req.query.token !== 'undefined') {
      const rawQueryToken = typeof req.query.token === 'string' ? req.query.token.trim() : undefined;
      delete (req.query as any).token;

      // Scoped compatibility fallback: disabled by default
      if (process.env.ALLOW_UNSAFE_QUERY_TOKEN === 'true' && rawQueryToken) {
        token = rawQueryToken;
      } else if (!authHeader) {
        res.status(401).json({
          success: false,
          error: {
            code: 'QUERY_TOKEN_DISALLOWED',
            message: 'Authentication tokens in URL query parameters are rejected. Please use Authorization header.',
          },
        });
        return;
      }
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access denied. Missing or malformed authorization token.',
        },
      });
      return;
    }

    const decoded = jwt.verify(token, securityConfig.jwt.secret, {
      algorithms: ['HS256'],
    }) as AuthenticatedUser;
    req.user = decoded;

    // Server-side session / token invalidation check (SEC-P1A)
    if (isValidUuid(decoded.id) && db && typeof (db as any).user?.findUnique === 'function') {
      const userRecord = await (db as any).user.findUnique({
        where: { id: decoded.id },
        select: { tokenVersion: true },
      });

      if (!userRecord) {
        res.status(401).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User associated with this token no longer exists.',
          },
        });
        return;
      }

      if ((decoded.tokenVersion ?? 0) !== userRecord.tokenVersion) {
        res.status(401).json({
          success: false,
          error: {
            code: 'REVOKED_TOKEN',
            message: 'Session has been invalidated. Please log in again.',
          },
        });
        return;
      }
    }

    // Workspace membership and tenant boundary validation across headers, query, and request body (AUDIT-HIGH-03 / SEC-08)
    const rawHeader = req.headers['x-workspace-id'];
    const headerWorkspaceId = Array.isArray(rawHeader)
      ? rawHeader[0]
      : typeof rawHeader === 'string'
        ? rawHeader
        : undefined;
    const queryWorkspaceId = typeof req.query?.workspaceId === 'string' ? req.query.workspaceId : undefined;
    const bodyWorkspaceId = typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : undefined;

    const candidateWorkspaceIds: string[] = [];
    if (headerWorkspaceId) candidateWorkspaceIds.push(headerWorkspaceId);
    if (queryWorkspaceId) candidateWorkspaceIds.push(queryWorkspaceId);
    if (bodyWorkspaceId) candidateWorkspaceIds.push(bodyWorkspaceId);

    const uniqueCandidateIds = Array.from(new Set(candidateWorkspaceIds));

    for (const candidateId of uniqueCandidateIds) {
      if (!isValidUuid(candidateId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WORKSPACE_ID',
            message: 'Invalid workspace ID format.',
          },
        });
        return;
      }

      const userRole = (req.user as any)?.role;
      const isSystemAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN' || userRole === 'SUPER_ADMIN';

      if (!isSystemAdmin && isValidUuid(req.user.id) && db && typeof (db as any).workspaceMember?.findFirst === 'function') {
        const membership = await (db as any).workspaceMember.findFirst({
          where: {
            workspaceId: candidateId,
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
    }

    if (uniqueCandidateIds.length > 0) {
      req.user.workspaceId = headerWorkspaceId || bodyWorkspaceId || queryWorkspaceId;
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
export const optionalAuthenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = undefined;
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      req.user = undefined;
      return next();
    }

    const decoded = jwt.verify(token, securityConfig.jwt.secret, {
      algorithms: ['HS256'],
    }) as AuthenticatedUser;
    if (isValidUuid(decoded.id) && db && typeof (db as any).user?.findUnique === 'function') {
      const userRecord = await (db as any).user.findUnique({
        where: { id: decoded.id },
        select: { tokenVersion: true },
      });
      if (!userRecord || (decoded.tokenVersion ?? 0) !== userRecord.tokenVersion) {
        req.user = undefined;
        return next();
      }
    }

    req.user = decoded;
    next();
  } catch {
    req.user = undefined;
    next();
  }
};
