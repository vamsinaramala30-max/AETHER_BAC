import { Request, Response, NextFunction } from 'express';
import { logger } from '../config';

/**
 * Authorization middleware ensuring the authenticated user has ADMIN or SUPER_ADMIN privileges.
 * Must be executed AFTER auth.middleware.ts.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'User authentication context missing.',
      },
    });
    return;
  }

  const allowedRoles = ['ADMIN', 'SUPER_ADMIN'];

  if (!allowedRoles.includes(req.user.role)) {
    logger.warn(`Forbidden admin access attempt by user ${req.user.id} with role ${req.user.role}`);
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Administrative privileges required to perform this action.',
      },
    });
    return;
  }

  next();
};