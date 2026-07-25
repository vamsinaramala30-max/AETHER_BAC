import { Request, Response, NextFunction } from 'express';

export const validatePreferences = (req: Request, res: Response, next: NextFunction): void => {
  const { emailAlerts, securityAlerts, systemUpdates, weeklyDigest } = req.body;
  if (
    typeof emailAlerts !== 'boolean' ||
    typeof securityAlerts !== 'boolean' ||
    typeof systemUpdates !== 'boolean' ||
    typeof weeklyDigest !== 'boolean'
  ) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid payload. All preference flags must be booleans.',
    });
    return;
  }
  next();
};
