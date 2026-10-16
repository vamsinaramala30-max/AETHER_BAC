import { AppError } from '../../../../middleware/error.middleware';
import { logger } from '../../../../config';
import type { PrismaClient } from '@prisma/client';

export interface CalendarSyncOptions {
  userId?: string;
  workspaceId?: string | null;
  prisma?: PrismaClient;
}

export class AppleCalendarSync {
  async sync(
    iCalUrlOrToken: string,
    calendarId: string,
    options?: CalendarSyncOptions,
  ): Promise<{ syncedCount: number }> {
    if (!iCalUrlOrToken) {
      throw new AppError(
        'Apple Calendar synchronization requires a valid CalDAV endpoint or iCal feed subscription URL',
        400,
        'INVALID_CALDAV_URL',
      );
    }

    const isUrl = /^https?:\/\//i.test(iCalUrlOrToken);
    if (!isUrl) {
      throw new AppError(
        'Apple Calendar synchronization requires a published .ics feed URL (webcal/https) or CalDAV credentials. Token-based sync without a CalDAV server is not supported by Apple.',
        501,
        'NOT_IMPLEMENTED',
      );
    }

    try {
      const response = await fetch(iCalUrlOrToken, {
        method: 'GET',
        headers: { Accept: 'text/calendar, text/plain, */*' },
      });

      if (!response.ok) {
        throw new AppError(
          `Apple iCal subscription feed returned HTTP ${response.status}: ${response.statusText}`,
          502,
          'PROVIDER_ERROR',
        );
      }

      const icsData = await response.text();
      const eventBlocks = icsData.split('BEGIN:VEVENT').slice(1);
      let syncedCount = 0;

      if (options?.prisma && options.userId) {
        const prisma = options.prisma;
        const userId = options.userId;
        const workspaceId = options.workspaceId;

        const existingEvents = await (prisma as any).calendarEvent.findMany({
          where: { userId, deletedAt: null },
        });

        for (const block of eventBlocks) {
          const uidMatch = block.match(/UID:(.+?)(\r?\n|$)/);
          const summaryMatch = block.match(/SUMMARY:(.+?)(\r?\n|$)/);
          const dtStartMatch = block.match(/DTSTART(?:;[^:]+)?:(\d{8}(?:T\d{6}Z?)?)(\r?\n|$)/);
          const dtEndMatch = block.match(/DTEND(?:;[^:]+)?:(\d{8}(?:T\d{6}Z?)?)(\r?\n|$)/);
          const descMatch = block.match(/DESCRIPTION:(.+?)(\r?\n|$)/);

          const uid = uidMatch ? uidMatch[1].trim() : `apple_${Date.now()}_${syncedCount}`;
          const title = summaryMatch ? summaryMatch[1].trim() : 'Apple Calendar Event';
          const description = descMatch ? descMatch[1].trim() : null;

          const parseIcsDate = (raw?: string): Date => {
            if (!raw) return new Date();
            if (raw.length === 8) {
              return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
            }
            const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
            const d = new Date(iso);
            return isNaN(d.getTime()) ? new Date() : d;
          };

          const startDate = parseIcsDate(dtStartMatch ? dtStartMatch[1].trim() : undefined);
          const endDate = dtEndMatch
            ? parseIcsDate(dtEndMatch[1].trim())
            : new Date(startDate.getTime() + 60 * 60 * 1000);

          const existing = existingEvents.find(
            (e: any) =>
              (e.reminders && (e.reminders as any).externalEventId === uid) ||
              (e.title === title &&
                new Date(e.startDate).getTime() === startDate.getTime() &&
                (!workspaceId || e.workspaceId === workspaceId)),
          );

          const remindersPayload = {
            calendarId,
            externalEventId: uid,
            provider: 'APPLE',
          };

          if (existing) {
            await (prisma as any).calendarEvent.update({
              where: { id: existing.id },
              data: {
                title,
                description,
                startDate,
                endDate,
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
                startDate,
                endDate,
                reminders: remindersPayload,
              },
            });
          }
          syncedCount++;
        }
      } else {
        syncedCount = eventBlocks.length;
      }

      logger.info(`[AppleCalendarSync] Successfully synchronized ${syncedCount} events from Apple feed`);
      return { syncedCount };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`[AppleCalendarSync] Unexpected error during sync: ${err.message}`);
      throw new AppError(`Apple calendar sync failure: ${err.message}`, 502, 'PROVIDER_ERROR');
    }
  }
}
