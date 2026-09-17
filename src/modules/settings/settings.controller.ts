import { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';
import { logger } from '../../config';

export class SettingsController {
  /**
   * GET /api/v1/settings
   * GET /api/v1/settings/profile
   */
  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const profile = await settingsService.getProfile(userId);
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      logger.error('Get profile failed:', error);
      next(error);
    }
  }

  /**
   * PATCH /api/v1/settings/profile
   * PUT /api/v1/settings/profile
   */
  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const updated = await settingsService.updateProfile(userId, req.body);
      res
        .status(200)
        .json({ success: true, data: updated, message: 'Profile updated successfully' });
    } catch (error: any) {
      logger.error('Update profile failed:', error);
      res.status(400).json({ success: false, error: error?.message || 'Failed to update profile' });
    }
  }

  /**
   * POST /api/v1/settings/profile/avatar
   */
  public async updateAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const avatarUrl = req.body?.avatarUrl || null;
      const updated = await settingsService.updateAvatar(userId, avatarUrl);
      res
        .status(200)
        .json({ success: true, data: updated, message: 'Avatar updated successfully' });
    } catch (error: any) {
      logger.error('Update avatar failed:', error);
      res.status(400).json({ success: false, error: error?.message || 'Failed to update avatar' });
    }
  }

  /**
   * DELETE /api/v1/settings/profile/avatar
   */
  public async removeAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const updated = await settingsService.updateAvatar(userId, null);
      res
        .status(200)
        .json({ success: true, data: updated, message: 'Avatar removed successfully' });
    } catch (error) {
      logger.error('Remove avatar failed:', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/settings/notifications
   */
  public async getNotificationPreferences(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const prefs = await settingsService.getNotificationPreferences(userId);
      res.status(200).json({ success: true, data: prefs });
    } catch (error) {
      logger.error('Get notification preferences failed:', error);
      next(error);
    }
  }

  /**
   * PATCH /api/v1/settings/notifications
   * PUT /api/v1/settings/notifications
   */
  public async updateNotificationPreferences(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const updated = await settingsService.updateNotificationPreferences(userId, req.body);
      res
        .status(200)
        .json({ success: true, data: updated, message: 'Notification preferences saved' });
    } catch (error: any) {
      logger.error('Update notification preferences failed:', error);
      res
        .status(400)
        .json({ success: false, error: error?.message || 'Failed to update preferences' });
    }
  }

  /**
   * PATCH /api/v1/settings/password
   * POST /api/v1/settings/password
   */
  public async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        res
          .status(400)
          .json({ success: false, error: 'Current password and new password are required.' });
        return;
      }

      await settingsService.changePassword(userId, currentPassword, newPassword, req.ip);
      res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error: any) {
      logger.error('Change password failed:', error);
      res
        .status(400)
        .json({ success: false, error: error?.message || 'Unable to update password.' });
    }
  }

  /**
   * GET /api/v1/settings/sessions
   */
  public async getActiveSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const currentToken = req.headers.authorization?.replace('Bearer ', '');
      const sessions = await settingsService.getActiveSessions(userId, currentToken);
      res.status(200).json({ success: true, data: sessions });
    } catch (error) {
      logger.error('Get active sessions failed:', error);
      next(error);
    }
  }

  /**
   * DELETE /api/v1/settings/sessions/:id
   */
  public async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const sessionId = req.params.id;
      await settingsService.revokeSession(userId, sessionId);
      res.status(200).json({ success: true, message: 'Session revoked successfully' });
    } catch (error: any) {
      logger.error('Revoke session failed:', error);
      res.status(400).json({ success: false, error: error?.message || 'Failed to revoke session' });
    }
  }

  /**
   * POST /api/v1/settings/sessions/revoke-all
   */
  public async revokeAllOtherSessions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const currentToken = req.headers.authorization?.replace('Bearer ', '');
      const count = await settingsService.revokeAllOtherSessions(userId, currentToken);
      res.status(200).json({ success: true, message: `Revoked ${count} active session(s).` });
    } catch (error) {
      logger.error('Revoke all other sessions failed:', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/settings/connections
   */
  public async getConnectedAccounts(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const connections = await settingsService.getConnectedAccounts(userId);
      res.status(200).json({ success: true, data: connections });
    } catch (error) {
      logger.error('Get connected accounts failed:', error);
      next(error);
    }
  }

  /**
   * DELETE /api/v1/settings/connections/:provider
   */
  public async disconnectAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const provider = req.params.provider;
      await settingsService.disconnectConnectedAccount(userId, provider);
      res
        .status(200)
        .json({ success: true, message: `${provider} account disconnected successfully` });
    } catch (error: any) {
      logger.error('Disconnect account failed:', error);
      res
        .status(400)
        .json({ success: false, error: error?.message || 'Failed to disconnect account' });
    }
  }

  /**
   * DELETE /api/v1/settings/account
   */
  public async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { confirmationText, password } = req.body;
      await settingsService.deleteAccount(userId, confirmationText, password);
      res.status(200).json({ success: true, message: 'Account successfully deleted.' });
    } catch (error: any) {
      logger.error('Delete account failed:', error);
      res.status(400).json({ success: false, error: error?.message || 'Account deletion failed' });
    }
  }
}

export const settingsController = new SettingsController();
