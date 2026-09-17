import bcrypt from 'bcryptjs';
import { db } from '../../database/client';
import { emailService } from '../notification/email.service';
import { logger } from '../../config';

export interface UserProfileDTO {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  phone: string | null;
  company: string | null;
  timezone: string;
  language: string;
  country: string;
  role: string;
  isEmailVerified: boolean;
  is2FAEnabled: boolean;
  passwordLastChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface NotificationPrefsDTO {
  emailAlerts: boolean;
  pushNotifications: boolean;
  browserNotifications: boolean;
  workspaceNotifications: boolean;
  projectNotifications: boolean;
  mentionNotifications: boolean;
  automationNotifications: boolean;
  securityAlerts: boolean;
  systemUpdates: boolean;
  weeklyDigest: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsDTO = {
  emailAlerts: true,
  pushNotifications: true,
  browserNotifications: true,
  workspaceNotifications: true,
  projectNotifications: true,
  mentionNotifications: true,
  automationNotifications: true,
  securityAlerts: true,
  systemUpdates: true,
  weeklyDigest: false,
};

export class SettingsService {
  /**
   * Fetch authenticated user's full profile
   */
  public async getProfile(userId: string): Promise<UserProfileDTO> {
    const user: any = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found.');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username || null,
      fullName: user.fullName || null,
      avatarUrl: user.avatarUrl || null,
      bio: user.bio || null,
      phone: user.phone || null,
      company: user.company || null,
      timezone: user.timezone || 'UTC',
      language: user.language || 'en',
      country: user.country || 'United States',
      role: user.role,
      isEmailVerified: Boolean(user.isEmailVerified),
      is2FAEnabled: Boolean(user.is2FAEnabled),
      passwordLastChangedAt: user.passwordLastChangedAt || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt || null,
    };
  }

  /**
   * Update user profile metadata
   */
  public async updateProfile(
    userId: string,
    data: Partial<UserProfileDTO>,
  ): Promise<UserProfileDTO> {
    const user: any = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User account not found.');
    }

    if (data.username && data.username.trim() !== user.username) {
      const existingUsername: any = await (db.user as any).findFirst({
        where: { username: data.username.trim() },
      });
      if (existingUsername && existingUsername.id !== userId) {
        throw new Error('Username is already taken by another user.');
      }
    }

    const updatePayload: Record<string, any> = {
      fullName: data.fullName !== undefined ? data.fullName : user.fullName,
      bio: data.bio !== undefined ? data.bio : user.bio,
      phone: data.phone !== undefined ? data.phone : user.phone,
      company: data.company !== undefined ? data.company : user.company,
      timezone: data.timezone !== undefined ? data.timezone : user.timezone,
      language: data.language !== undefined ? data.language : user.language,
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : user.avatarUrl,
    };

    if (data.username !== undefined) {
      updatePayload.username = data.username ? data.username.trim() : null;
    }
    if (data.country !== undefined) {
      updatePayload.country = data.country;
    }

    await db.user.update({
      where: { id: userId },
      data: updatePayload as any,
    });

    return this.getProfile(userId);
  }

  /**
   * Update avatar image URL
   */
  public async updateAvatar(userId: string, avatarUrl: string | null): Promise<UserProfileDTO> {
    await db.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    return this.getProfile(userId);
  }

  /**
   * Get notification preferences for user
   */
  public async getNotificationPreferences(userId: string): Promise<NotificationPrefsDTO> {
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    if (!settings || !settings.notificationPrefs) {
      return DEFAULT_NOTIFICATION_PREFS;
    }

    const prefs = settings.notificationPrefs as Record<string, any>;
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...prefs,
    };
  }

  /**
   * Update notification preferences
   */
  public async updateNotificationPreferences(
    userId: string,
    data: Partial<NotificationPrefsDTO>,
  ): Promise<NotificationPrefsDTO> {
    const currentPrefs = await this.getNotificationPreferences(userId);
    const updatedPrefs: NotificationPrefsDTO = {
      ...currentPrefs,
      ...data,
    };

    const currentSettings = await db.userSettings.findUnique({ where: { userId } });

    if (!currentSettings) {
      await db.userSettings.create({
        data: {
          userId,
          notificationPrefs: updatedPrefs as any,
        },
      });
    } else {
      await db.userSettings.update({
        where: { userId },
        data: {
          notificationPrefs: updatedPrefs as any,
        },
      });
    }

    return updatedPrefs;
  }

  /**
   * Change user password with validation and security email notification
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
  ): Promise<void> {
    const user: any = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found.');
    }

    if (!user.passwordHash) {
      throw new Error(
        'This account uses Google OAuth. Please set a password or use your connected account.',
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new Error('Unable to update your password. Please verify your current password.');
    }

    // Password strength rules
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }
    if (!/[A-Z]/.test(newPassword)) {
      throw new Error('New password must contain at least one uppercase letter.');
    }
    if (!/[a-z]/.test(newPassword)) {
      throw new Error('New password must contain at least one lowercase letter.');
    }
    if (!/[0-9]/.test(newPassword)) {
      throw new Error('New password must contain at least one number.');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      throw new Error('New password must contain at least one special character.');
    }

    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);
    const now = new Date();

    const passwordUpdateData: Record<string, any> = {
      passwordHash: newPasswordHash,
      passwordLastChangedAt: now,
    };

    await db.user.update({
      where: { id: userId },
      data: passwordUpdateData as any,
    });

    // Create security in-app notification
    await db.notification.create({
      data: {
        userId,
        title: 'Password Changed',
        message: 'Your AETHER account password was successfully updated.',
        type: 'SECURITY',
      },
    });

    // Send security notification email
    const formattedTime = now.toUTCString();
    emailService
      .sendPasswordChangedEmail(
        user.email,
        user.fullName || user.email.split('@')[0],
        formattedTime,
        ipAddress,
      )
      .catch((err) => logger.error('Failed to dispatch password changed email:', err));
  }

  /**
   * Get user active sessions
   */
  public async getActiveSessions(userId: string, currentRefreshToken?: string) {
    const sessions = await db.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => {
      const userAgent = s.userAgent || '';
      let browser = 'Unknown Browser';
      let os = 'Unknown OS';
      let device = 'Desktop Device';

      if (userAgent.includes('Chrome')) browser = 'Google Chrome';
      else if (userAgent.includes('Firefox')) browser = 'Mozilla Firefox';
      else if (userAgent.includes('Safari') && !userAgent.includes('Chrome'))
        browser = 'Apple Safari';
      else if (userAgent.includes('Edg')) browser = 'Microsoft Edge';

      if (userAgent.includes('Windows')) os = 'Windows OS';
      else if (userAgent.includes('Mac OS')) os = 'macOS';
      else if (userAgent.includes('Linux')) os = 'Linux OS';
      else if (userAgent.includes('Android')) {
        os = 'Android OS';
        device = 'Mobile Device';
      } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        os = 'iOS';
        device = 'Mobile Device';
      }

      return {
        id: s.id,
        browser,
        os,
        device,
        ipAddress: s.ipAddress || '127.0.0.1',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: currentRefreshToken ? s.refreshToken === currentRefreshToken : false,
      };
    });
  }

  /**
   * Revoke individual session
   */
  public async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await db.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new Error('Session not found or already revoked.');
    }
    await db.session.delete({ where: { id: sessionId } });
  }

  /**
   * Revoke all other sessions for user
   */
  public async revokeAllOtherSessions(
    userId: string,
    currentRefreshToken?: string,
  ): Promise<number> {
    const whereCondition: any = { userId };
    if (currentRefreshToken) {
      whereCondition.refreshToken = { not: currentRefreshToken };
    }
    const result = await db.session.deleteMany({
      where: whereCondition,
    });
    return result.count;
  }

  /**
   * Fetch connected OAuth accounts for user
   */
  public async getConnectedAccounts(userId: string) {
    const accounts = await db.oAuthAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        createdAt: true,
      },
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });

    return [
      {
        provider: 'google',
        name: 'Google',
        connected: accounts.some((a) => a.provider === 'google'),
        accountEmail: accounts.find((a) => a.provider === 'google') ? user?.email : null,
        connectedAt: accounts.find((a) => a.provider === 'google')?.createdAt || null,
        canDisconnect: Boolean(
          user?.passwordHash || accounts.filter((a) => a.provider !== 'google').length > 0,
        ),
      },
    ];
  }

  /**
   * Disconnect OAuth identity
   */
  public async disconnectConnectedAccount(userId: string, provider: string): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found.');
    }

    const oauthAccounts = await db.oAuthAccount.findMany({ where: { userId } });
    const targetAccount = oauthAccounts.find(
      (a) => a.provider.toLowerCase() === provider.toLowerCase(),
    );

    if (!targetAccount) {
      throw new Error(`No connected ${provider} account found.`);
    }

    const hasPassword = Boolean(user.passwordHash);
    const hasOtherProviders = oauthAccounts.length > 1;

    if (!hasPassword && !hasOtherProviders) {
      throw new Error(
        `Cannot disconnect ${provider}. Google is your only sign-in method. Please set a password first to prevent lockout.`,
      );
    }

    await db.oAuthAccount.delete({
      where: { id: targetAccount.id },
    });
  }

  /**
   * Delete user account permanently after password/confirmation verification
   */
  public async deleteAccount(
    userId: string,
    confirmationText: string,
    password?: string,
  ): Promise<void> {
    if (confirmationText !== 'DELETE') {
      throw new Error('Please type "DELETE" in uppercase to confirm account deletion.');
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User account not found.');
    }

    if (user.passwordHash) {
      if (!password) {
        throw new Error('Password authentication is required to delete your account.');
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        throw new Error('Invalid password. Account deletion aborted.');
      }
    }

    // Cascade delete user and associated sessions
    await db.user.delete({
      where: { id: userId },
    });
  }
}

export const settingsService = new SettingsService();
