import { RecurrenceEngine } from '../utils/recurrence';
import { Event } from '@prisma/client';

export class RecurrenceExpansionEngine {
  static expand(event: Event & { recurrence?: any; exceptions?: any[] }, windowStart: Date, windowEnd: Date) {
    if (!event.recurrence) return [event];

    const dates = RecurrenceEngine.generateInstances(
      event.recurrence.rrule,
      event.startTime,
      windowStart,
      windowEnd
    );

    const duration = event.endTime.getTime() - event.startTime.getTime();
    const cancelledMap = new Set(event.exceptions?.filter(e => e.isCancelled).map(e => e.originalInstance.toISOString()));

    return dates
      .filter(d => !cancelledMap.has(d.toISOString()))
      .map((date) => {
        const instanceStart = date;
        const instanceEnd = new Date(date.getTime() + duration);
        return {
          ...event,
          id: `${event.id}_${date.getTime()}`,
          recurringEventId: event.id,
          startTime: instanceStart,
          endTime: instanceEnd,
        };
      });
  }
}