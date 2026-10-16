import { AppError } from '../../../../middleware/error.middleware';
import { logger } from '../../../../config';
import type { PrismaClient } from '@prisma/client';

export interface CalendarSyncOptions {
  userId?: string;
  workspaceId?: string | null;
  prisma?: PrismaClient;
}

export class GoogleCalendarSync {
  async sync(
    accessToken: string,
    calendarId: string,
    options?: CalendarSyncOptions,
  ): Promise<{ syncedCount: number }> {
    if (!accessToken) {
      throw new AppError('Google Calendar access token is required', 401, 'INVALID_CREDENTIALS');
    }

    try {
      const targetCalendarId =
        !calendarId || calendarId === 'primary' ? 'primary' : encodeURIComponent(calendarId);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${targetCalendarId}/events?singleEvents=true&maxResults=250`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          'Google Calendar authentication failed: Invalid or expired access token',
          401,
          'INVALID_CREDENTIALS',
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new AppError(
          `Google Calendar API error (${response.status}): ${errorText}`,
          502,
          'PROVIDER_ERROR',
        );
      }

      const payload = (await response.json()) as any;
      const items: any[] = Array.isArray(payload?.items) ? payload.items : [];

      let syncedCount = 0;

      if (options?.prisma && options.userId) {
        const prisma = options.prisma;
        const userId = options.userId;
        const workspaceId = options.workspaceId;

        // Fetch existing events for user to prevent duplicate events on repeat sync
        const existingEvents = await (prisma as any).calendarEvent.findMany({
          where: { userId, deletedAt: null },
        });

        for (const item of items) {
          const title = item.summary || 'Untitled Event';
          const description = item.description || null;
          const location = item.location || null;
          const startDate = item.start?.dateTime
            ? new Date(item.start.dateTime)
            : item.start?.date
              ? new Date(item.start.date)
              : new Date();
          const endDate = item.end?.dateTime
            ? new Date(item.end.dateTime)
            : item.end?.date
              ? new Date(item.end.date)
              : new Date(startDate.getTime() + 60 * 60 * 1000);
          const allDay = Boolean(!item.start?.dateTime && item.start?.date);
          const recurrence = item.recurrence ? JSON.stringify(item.recurrence) : null;

          // Deduplication: match by externalEventId or (title, start timestamp)
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
            provider: 'GOOGLE',
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
                recurrence,
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
                recurrence,
                reminders: remindersPayload,
              },
            });
          }
          syncedCount++;
        }
      } else {
        syncedCount = items.length;
      }

      logger.info(`[GoogleCalendarSync] Successfully synchronized ${syncedCount} events from Google`);
      return { syncedCount };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`[GoogleCalendarSync] Unexpected error during sync: ${err.message}`);
      throw new AppError(`Google Calendar sync failure: ${err.message}`, 502, 'PROVIDER_ERROR');
    }
  }
}
