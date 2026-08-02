// Simple recurrence engine stub replacing external rrule dependency
export class RecurrenceEngine {
  static parseRule(rruleStr: string, dtstart: Date): any {
    return { dtstart, rruleStr };
  }

  static generateInstances(
    rruleStr: string,
    dtstart: Date,
    windowStart: Date,
    windowEnd: Date,
  ): Date[] {
    const dates: Date[] = [];
    const curr = new Date(dtstart.getTime());
    while (curr <= windowEnd) {
      if (curr >= windowStart) {
        dates.push(new Date(curr.getTime()));
      }
      // Increment by 1 day as simple fallback instance generator
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }

  static validateRRule(rruleStr: string): boolean {
    return Boolean(rruleStr && rruleStr.length > 0);
  }
}
