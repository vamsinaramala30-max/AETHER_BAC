import { PrismaClient, SyncProvider, SyncStatus } from '@prisma/client';
import { GoogleCalendarSync } from './google.sync';
import { OutlookCalendarSync } from './outlook.sync';
import { AppleCalendarSync } from './apple.sync';
import { CalendarEventBus, CALENDAR_EVENTS } from '../calendar.events';

export class SyncService {
  private googleSync = new GoogleCalendarSync();
  private outlookSync = new OutlookCalendarSync();
  private appleSync = new AppleCalendarSync();

  constructor(private prisma: PrismaClient) {}

  async triggerSync(userId: string, calendarId: string, provider: SyncProvider) {
    const account = await this.prisma.syncAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });

    if (!account) throw new Error(`No connected ${provider} account found for user.`);

    const job = await this.prisma.syncJob.create({
      data: { syncAccountId: account.id, calendarId, status: SyncStatus.SYNCING },
    });

    try {
      let result = { syncedCount: 0 };
      if (provider === SyncProvider.GOOGLE) {
        result = await this.googleSync.sync(account.accessToken, calendarId);
      } else if (provider === SyncProvider.OUTLOOK) {
        result = await this.outlookSync.sync(account.accessToken, calendarId);
      } else if (provider === SyncProvider.APPLE) {
        result = await this.appleSync.sync(account.accessToken, calendarId);
      }

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { status: SyncStatus.SUCCESS, lastSyncedAt: new Date() },
      });

      CalendarEventBus.emit(CALENDAR_EVENTS.SYNC_COMPLETED, {
        userId,
        data: { provider, syncedCount: result.syncedCount },
      });

      return { status: 'SUCCESS', ...result };
    } catch (err: any) {
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { status: SyncStatus.FAILED, errorMessage: err.message },
      });
      throw err;
    }
  }
}