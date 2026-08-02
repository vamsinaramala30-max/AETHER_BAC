import { NextFunction, Request, Response } from 'express';
import { ASSISTANT_CONSTANTS } from './assistant.constants';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export class AssistantMiddleware {
  public static authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const userIdHeader = req.headers['x-user-id'] as string;

    if (!userIdHeader) {
      res.status(401).json({ error: ASSISTANT_CONSTANTS.ERRORS.UNAUTHORIZED_ACCESS });
      return;
    }

    req.user = {
      id: userIdHeader,
      workspaceId: (req.headers['x-workspace-id'] as string) || undefined,
    };

    next();
  }

  public static authorize(
    rolesAllowed: string[] = [],
  ): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ error: ASSISTANT_CONSTANTS.ERRORS.UNAUTHORIZED_ACCESS });
        return;
      }

      if (rolesAllowed.length > 0) {
        const userRoles = req.user.roles || [];
        const hasRole = rolesAllowed.some((r) => userRoles.includes(r));
        if (!hasRole) {
          res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
          return;
        }
      }

      next();
    };
  }

  public static rateLimiterHook(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void {
    // Production Rate Limiting Integration Hook
    next();
  }
}
