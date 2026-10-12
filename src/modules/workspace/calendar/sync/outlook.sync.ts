import { AppError } from '../../../../middleware/error.middleware';
import { logger } from '../../../../config';
import type { PrismaClient } from '@prisma/client';

export interface CalendarSyncOptions {
  userId?: string;
  workspaceId?: string | null;
  prisma?: PrismaClient;
}

export class OutlookCalendarSync {
  async sync(
    accessToken: string,
    calendarId: string,
    options?: CalendarSyncOptions,
  ): Promise<{ syncedCount: number }> {
    if (!accessToken) {
      throw new AppError('Outlook access token is required', 401, 'INVALID_CREDENTIALS');
    }

    try {
      const targetUrl =
        !calendarId || calendarId === 'primary'
          ? 'https://graph.microsoft.com/v1.0/me/events?$top=250'
          : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events?$top=250`;

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          'Outlook authentication failed: Invalid or expired Microsoft Graph token',
          401,
          'INVALID_CREDENTIALS',
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new AppError(
          `Microsoft Graph API error (${response.status}): ${errorText}`,
          502,
          'PROVIDER_ERROR',
        );
      }

      const payload = (await response.json()) as any;
      const items: any[] = Array.isArray(payload?.value) ? payload.value : [];

      let syncedCount = 0;

      if (options?.prisma && options.userId) {
        const prisma = options.prisma;
        const userId = options.userId;
        const workspaceId = options.workspaceId;

        // Fetch existing events to deduplicate
        const existingEvents = await (prisma as any).calendarEvent.findMany({
          where: { userId, deletedAt: null },
        });

        for (const item of items) {
          const title = item.subject || 'Untitled Event';
          const description = item.bodyPreview || null;
          const location = item.location?.displayName || null;
          const startDate = item.start?.dateTime ? new Date(item.start.dateTime) : new Date();
          const endDate = item.end?.dateTime
            ? new Date(item.end.dateTime)
            : new Date(startDate.getTime() + 60 * 60 * 1000);
          const allDay = Boolean(item.isAllDay);

          const existing = existingEvents.find(
            (e: any) =>
              (e.reminders && (e.reminders as any).externalEventId === item.id) ||
              (e.title === title &&
                new Date(e.startDate).getTime() === startDate.getTime() &&
                (!workspaceId || e.workspaceId === workspaceId)),
          );

          const remindersPayload = {
            calendarId,
            externalEventId: item.id,
            provider: 'OUTLOOK',
          };

          if (existing) {
            await (prisma as any).calendarEvent.update({
              where: { id: existing.id },
              data: {
                title,
                description,
                location,
                startDate,
                endDate,
                allDay,
                reminders: remindersPayload,
              },
            });
          } else if (workspaceId) {
            await (prisma as any).calendarEvent.create({
              data: {
                userId,
                workspaceId,
                title,
                description,
                location,
                startDate,
                endDate,
                allDay,
                reminders: remindersPayload,
              },
            });
          }
          syncedCount++;
        }
      } else {
        syncedCount = items.length;
      }

      logger.info(`[OutlookCalendarSync] Successfully synchronized ${syncedCount} events from Outlook`);
      return { syncedCount };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`[OutlookCalendarSync] Unexpected error during sync: ${err.message}`);
      throw new AppError(`Outlook calendar sync failure: ${err.message}`, 502, 'PROVIDER_ERROR');
    }
  }
}
