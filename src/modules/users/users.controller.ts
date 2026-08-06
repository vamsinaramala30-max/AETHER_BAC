import { Request, Response, NextFunction } from 'express';
import { UsersService } from './users.service';

const usersService = new UsersService();

// Per-user connected accounts store in memory
const userConnectionsMap = new Map<string, Record<string, string>>();

export class UsersController {
  public async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const result = await usersService.listUsers(page, limit);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.getUserById(req.params.id);
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }

  public async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await usersService.updateUser(req.params.id, req.body);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  public async getConnectedAccounts(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = (req as any).user?.id || 'anonymous';
      const userConnections = userConnectionsMap.get(userId) || {};

      // All newly registered or logged-in users start with NO connected third-party accounts (Disconnected)
      const providers = [
        { provider: 'github', identityName: userConnections.github || '' },
        { provider: 'google', identityName: userConnections.google || '' },
        { provider: 'gitlab', identityName: userConnections.gitlab || '' },
      ];

      res.status(200).json(providers);
    } catch (err) {
      next(err);
    }
  }

  public async disconnectAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || 'anonymous';
      const provider = req.params.provider;

      const userConnections = userConnectionsMap.get(userId) || {};
      delete userConnections[provider];
      userConnectionsMap.set(userId, userConnections);

      res.status(200).json({ success: true, message: `${provider} disconnected successfully` });
    } catch (err) {
      next(err);
    }
  }

  public async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        data: {
          theme: 'dark',
          language: 'en',
          timezone: 'America/New_York',
          compactView: false,
          enableSound: true,
          emailDigest: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        data: req.body,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getNotificationSettings(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        data: {
          emailNotifications: true,
          pushNotifications: true,
          securityAlerts: true,
          productUpdates: false,
          weeklyDigest: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateNotificationSettings(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        data: req.body,
      });
    } catch (err) {
      next(err);
    }
  }

  public async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await usersService.deleteUser(req.params.id);
      res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export const usersController = new UsersController();
