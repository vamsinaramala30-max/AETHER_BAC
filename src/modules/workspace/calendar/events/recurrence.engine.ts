import { RecurrenceEngine } from '../utils/recurrence';

export class RecurrenceExpansionEngine {
  static expand(
    event: any & { recurrence?: any; exceptions?: any[] },
    windowStart: Date,
    windowEnd: Date,
  ) {
    if (!event.recurrence) return [event];

    const dates = RecurrenceEngine.generateInstances(
      event.recurrence.rrule,
      event.startTime,
      windowStart,
      windowEnd,
    );

    const duration = event.endTime.getTime() - event.startTime.getTime();
    const cancelledMap = new Set(
      event.exceptions
        ?.filter((e: any) => e.isCancelled)
        .map((e: any) => e.originalInstance.toISOString()),
    );

    return dates
      .filter((d: Date) => !cancelledMap.has(d.toISOString()))
      .map((date: Date) => {
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
