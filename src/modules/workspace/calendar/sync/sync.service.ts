import { PrismaClient } from '@prisma/client';
import { GoogleCalendarSync } from './google.sync';
import { OutlookCalendarSync } from './outlook.sync';
import { AppleCalendarSync } from './apple.sync';
import { CalendarEventBus, CALENDAR_EVENTS } from '../calendar.events';
import { AppError } from '../../../../middleware/error.middleware';
import { logger } from '../../../../config';

export enum SyncProvider {
  GOOGLE = 'GOOGLE',
  OUTLOOK = 'OUTLOOK',
  APPLE = 'APPLE',
}

export enum SyncStatus {
  SYNCING = 'SYNCING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

const isUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

export class SyncService {
  private googleSync = new GoogleCalendarSync();
  private outlookSync = new OutlookCalendarSync();
  private appleSync = new AppleCalendarSync();

  constructor(private prisma: PrismaClient) {}

  /**
   * Validates whether provider integration is enabled and configured.
   */
  public isProviderConfigured(provider: SyncProvider): boolean {
    switch (provider) {
      case SyncProvider.GOOGLE:
        return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
      case SyncProvider.OUTLOOK:
        return Boolean(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET);
      case SyncProvider.APPLE:
        return Boolean(process.env.APPLE_CALDAV_URL || process.env.APPLE_CLIENT_ID);
      default:
        return false;
    }
  }

  /**
   * Triggers calendar synchronization for an authenticated user.
   */
  async triggerSync(
    userId: string,
    calendarId: string,
    provider: SyncProvider,
    workspaceId?: string,
  ): Promise<{ status: string; syncedCount: number; jobId: string }> {
    // 1. Identity & input authorization
    if (!userId || !isUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required for calendar sync', 401, 'UNAUTHORIZED');
    }

    if (!calendarId) {
      throw new AppError('Calendar ID is required for synchronization', 400, 'INVALID_CALENDAR_ID');
    }

    // 2. Validate calendar ownership and workspace authorization
    const calendar = await this.prisma.userCalendar.findFirst({
      where: { id: calendarId, userId, deletedAt: null },
    });

    if (!calendar) {
      throw new AppError(`Calendar "${calendarId}" not found or unauthorized`, 404, 'NOT_FOUND');
    }

    const effectiveWorkspaceId = workspaceId || calendar.workspaceId;
    if (effectiveWorkspaceId) {
      const membership = await this.prisma.workspaceMember.findFirst({
        where: { workspaceId: effectiveWorkspaceId, userId },
      });
      if (!membership) {
        throw new AppError('Forbidden: Access to calendar workspace denied', 403, 'FORBIDDEN');
      }
    }

    // 3. Verify provider configuration
    const isConfigured = this.isProviderConfigured(provider);
    const allowMockSync = process.env.NODE_ENV === 'test';

    if (!isConfigured && !allowMockSync) {
      throw new AppError(
        `Calendar sync provider "${provider}" is currently not configured or unavailable in this environment`,
        503,
        'PROVIDER_UNAVAILABLE',
      );
    }

    // 4. Resolve connected SyncAccount
    const account = await this.prisma.syncAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });

    if (!account) {
      throw new AppError(
        `No connected ${provider} account found for user. Please authenticate with ${provider} first.`,
        404,
        'SYNC_ACCOUNT_NOT_FOUND',
      );
    }

    // 5. Concurrency / Duplicate sync prevention
    const activeJob = await this.prisma.syncJob.findFirst({
      where: {
        syncAccountId: account.id,
        calendarId,
        status: SyncStatus.SYNCING,
      },
    });

    if (activeJob) {
      throw new AppError(
        `A synchronization job is already in progress for calendar "${calendarId}". Duplicate sync rejected.`,
        409,
        'SYNC_ALREADY_IN_PROGRESS',
      );
    }

    // 6. Create durable SyncJob record
    const job = await this.prisma.syncJob.create({
      data: {
        syncAccountId: account.id,
        calendarId,
        status: SyncStatus.SYNCING,
      },
    });

    // 7. Execute synchronization with provider
    try {
      let result = { syncedCount: 0 };

      // Bounded execution with timeout
      const syncPromise = (async () => {
        const syncOptions = {
          userId,
          workspaceId: effectiveWorkspaceId,
          prisma: this.prisma,
        };
        if (provider === SyncProvider.GOOGLE) {
          return await this.googleSync.sync(account.accessToken, calendarId, syncOptions);
        } else if (provider === SyncProvider.OUTLOOK) {
          return await this.outlookSync.sync(account.accessToken, calendarId, syncOptions);
        } else if (provider === SyncProvider.APPLE) {
          return await this.appleSync.sync(account.accessToken, calendarId, syncOptions);
        }
        throw new AppError(`Unsupported sync provider: ${provider}`, 400, 'UNSUPPORTED_PROVIDER');
      })();

      const timeoutPromise = new Promise<{ syncedCount: number }>((_, reject) => {
        setTimeout(() => reject(new Error(`Sync provider ${provider} timed out after 15 seconds`)), 15000);
      });

      result = await Promise.race([syncPromise, timeoutPromise]);

      // 8. Update job record on success
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: SyncStatus.SUCCESS,
          syncedCount: result.syncedCount,
          lastSyncedAt: new Date(),
        },
      });

      // 9. Emit domain completion event
      CalendarEventBus.emit(CALENDAR_EVENTS.SYNC_COMPLETED, {
        userId,
        data: { provider, syncedCount: result.syncedCount, calendarId, jobId: job.id },
      });

      logger.info(
        `[CalendarSync] Successfully synchronized ${result.syncedCount} events for user ${userId} via ${provider}`,
      );

      return { status: 'SUCCESS', syncedCount: result.syncedCount, jobId: job.id };
    } catch (err: any) {
      const sanitizedMessage = (err?.message || 'Unknown provider error').replace(
        /Bearer\s+[A-Za-z0-9-_.]+/gi,
        '[REDACTED_TOKEN]',
      );

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: SyncStatus.FAILED,
          errorMessage: sanitizedMessage,
        },
      });

      logger.error(`[CalendarSync] Sync failed for job ${job.id}: ${sanitizedMessage}`);
      throw err;
    }
  }
}
