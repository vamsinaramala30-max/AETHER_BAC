import cron from 'node-cron';
import { AutomationTriggerType } from '../automation.types';

export interface ScheduleCalculationOptions {
  schedule: string;
  timezone?: string; // Default: 'UTC'
  afterDate?: Date; // Default: new Date()
  triggerType?: AutomationTriggerType;
}

export class ScheduleManager {
  /**
   * Validates if a timezone string is a recognized IANA timezone.
   */
  public static isValidTimezone(timezone?: string): boolean {
    if (!timezone) return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone.trim() });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalizes and validates the timezone. Falls back to 'UTC' if invalid or undefined.
   */
  public static normalizeTimezone(timezone?: string): string {
    if (!timezone || !ScheduleManager.isValidTimezone(timezone)) {
      return 'UTC';
    }
    return timezone.trim();
  }

  /**
   * Validates a standard 5-part cron expression.
   */
  public static isValidCron(cronExpression: string): boolean {
    if (!cronExpression) return false;
    return cron.validate(cronExpression.trim());
  }

  /**
   * Parses duration string (e.g. '30m', '6h', '1d', '60s') into milliseconds.
   */
  public static parseIntervalMs(intervalStr: string): number | null {
    if (!intervalStr) return null;
    const clean = intervalStr.trim().toLowerCase();

    if (/^\d+$/.test(clean)) {
      const mins = parseInt(clean, 10);
      return mins > 0 ? mins * 60 * 1000 : null;
    }

    // Match patterns like 'every 6 hours', 'interval:6h', '6h', '30m', '1d'
    const match = clean.match(/(?:every\s+|interval:)?(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|w|weeks?)/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (isNaN(value) || value <= 0) return null;

    if (unit.startsWith('s')) return value * 1000;
    if (unit.startsWith('m')) return value * 60 * 1000;
    if (unit.startsWith('h')) return value * 60 * 60 * 1000;
    if (unit.startsWith('d')) return value * 24 * 60 * 60 * 1000;
    if (unit.startsWith('w')) return value * 7 * 24 * 60 * 60 * 1000;

    return null;
  }

  /**
   * Helper to normalize common schedule aliases into canonical cron or expressions.
   */
  public static normalizeSchedule(schedule: string): string {
    if (!schedule) return '0 * * * *';
    const s = schedule.toLowerCase().trim();

    switch (s) {
      case 'hourly':
        return '0 * * * *';
      case 'daily':
        return '0 0 * * *';
      case 'weekly':
        return '0 0 * * 0';
      case 'monthly':
        return '0 0 1 * *';
      case 'weekdays':
        return '0 9 * * 1-5';
      default:
        return schedule.trim();
    }
  }

  /**
   * Detects the trigger type from the schedule definition.
   */
  public static detectTriggerType(schedule: string): AutomationTriggerType {
    if (!schedule) return 'MANUAL';
    const s = schedule.trim();

    // 1. Interval format: e.g. '360', 'every 6 hours', '30m'
    if (ScheduleManager.parseIntervalMs(s) !== null) {
      return 'INTERVAL';
    }

    // 2. Weekly prefix or pattern: e.g. '1 09:00', 'every monday at 09:00'
    if (
      s.toLowerCase().startsWith('weekly') ||
      s.toLowerCase().startsWith('every monday') ||
      /^(?:weekly\s+|every\s+)?(?:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|[0-6])\s+(?:at\s+)?\d{1,2}:\d{2}/i.test(s)
    ) {
      return 'WEEKLY';
    }

    // 3. Daily / Time pattern: e.g. '08:00', 'daily 08:00', 'every day at 8:00 AM'
    if (
      s.toLowerCase().startsWith('daily') ||
      s.toLowerCase().startsWith('every day') ||
      /^(?:(?:daily|every day(?: at)?)\s+)?\d{1,2}:\d{2}(?:\s*(am|pm))?$/i.test(s)
    ) {
      return 'RECURRING';
    }

    // 4. ISO Date / future timestamp -> ONE_TIME
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || (!/^\d+$/.test(s) && !isNaN(Date.parse(s)))) {
      return 'ONE_TIME';
    }

    // 5. Standard cron
    if (ScheduleManager.isValidCron(ScheduleManager.normalizeSchedule(s))) {
      return 'CRON';
    }

    return 'RECURRING';
  }

  /**
   * Helper to get local date parts for a given instant in a specific timezone.
   */
  private static getZonedParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }

    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10), // 1-12
      day: parseInt(map.day, 10), // 1-31
      hour: parseInt(map.hour, 10) === 24 ? 0 : parseInt(map.hour, 10), // 0-23
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second, 10),
      dayOfWeek: weekdayMap[map.weekday] ?? 0, // 0-6
    };
  }

  /**
   * Constructs a canonical UTC Date from target wall-clock values in a given timezone.
   */
  public static fromZonedDateTime(
    year: number,
    month: number, // 1-12
    day: number,
    hour: number,
    minute: number,
    second: number = 0,
    timeZone: string = 'UTC',
  ): Date {
    // Start with UTC estimation
    const estUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (timeZone === 'UTC') return estUtc;

    // Determine offset between target timezone and UTC
    const zoned = ScheduleManager.getZonedParts(estUtc, timeZone);
    const estZonedUtc = new Date(
      Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second),
    );
    const offsetMs = estZonedUtc.getTime() - estUtc.getTime();

    // Adjust UTC timestamp
    const correctedUtc = new Date(estUtc.getTime() - offsetMs);

    // Double check for DST boundary precision
    const verifyZoned = ScheduleManager.getZonedParts(correctedUtc, timeZone);
    if (verifyZoned.hour !== hour || verifyZoned.minute !== minute) {
      const verifyEst = new Date(
        Date.UTC(
          verifyZoned.year,
          verifyZoned.month - 1,
          verifyZoned.day,
          verifyZoned.hour,
          verifyZoned.minute,
          verifyZoned.second,
        ),
      );
      const diff = verifyEst.getTime() - estUtc.getTime();
      return new Date(correctedUtc.getTime() - diff);
    }

    return correctedUtc;
  }

  /**
   * Authoritative Next-Run Calculator.
   * Calculates the exact next execution timestamp in canonical UTC.
   */
  public static calculateNextRun(
    schedule: string | { type?: string; value?: string },
    timezone: string = 'UTC',
    afterDate: Date = new Date(),
  ): Date | null {
    if (!schedule) return null;
    const rawStr = typeof schedule === 'string' ? schedule : (schedule as any).value || '';
    if (!rawStr) return null;
    const tz = ScheduleManager.normalizeTimezone(timezone);
    const cleanSchedule = rawStr.trim();
    const triggerType = (typeof schedule === 'object' && (schedule as any).type)
      ? (schedule as any).type as AutomationTriggerType
      : ScheduleManager.detectTriggerType(cleanSchedule);

    // 1. ONE_TIME schedule: e.g. '2026-10-02T09:00:00.000Z' or '2026-10-02 09:00'
    if (triggerType === 'ONE_TIME') {
      let targetDate: Date;
      if (cleanSchedule.includes('T') && cleanSchedule.endsWith('Z')) {
        targetDate = new Date(cleanSchedule);
      } else {
        // Parse date in given timezone
        const parsed = new Date(cleanSchedule);
        if (isNaN(parsed.getTime())) return null;
        targetDate = parsed;
      }
      return targetDate.getTime() > afterDate.getTime() ? targetDate : null;
    }

    // 2. INTERVAL schedule: e.g. 'every 6 hours', '30m'
    if (triggerType === 'INTERVAL') {
      const intervalMs = ScheduleManager.parseIntervalMs(cleanSchedule);
      if (!intervalMs) return null;
      return new Date(afterDate.getTime() + intervalMs);
    }

    // 3. DAILY / RECURRING: e.g. 'daily 08:00' or '08:00' or 'every day at 8:00 AM'
    const dailyMatch = cleanSchedule.match(/^(?:(?:daily|every day(?: at)?)\s+)?(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (dailyMatch) {
      let hour = parseInt(dailyMatch[1], 10);
      const minute = parseInt(dailyMatch[2], 10);
      const ampm = dailyMatch[3]?.toLowerCase();

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;

      const currentZoned = ScheduleManager.getZonedParts(afterDate, tz);
      let targetYear = currentZoned.year;
      let targetMonth = currentZoned.month;
      let targetDay = currentZoned.day;

      // Check if time today has already passed in this timezone
      if (
        currentZoned.hour > hour ||
        (currentZoned.hour === hour && currentZoned.minute >= minute)
      ) {
        // Move to tomorrow
        const tomorrow = new Date(afterDate.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowZoned = ScheduleManager.getZonedParts(tomorrow, tz);
        targetYear = tomorrowZoned.year;
        targetMonth = tomorrowZoned.month;
        targetDay = tomorrowZoned.day;
      }

      return ScheduleManager.fromZonedDateTime(targetYear, targetMonth, targetDay, hour, minute, 0, tz);
    }

    // 4. WEEKLY: e.g. 'every monday at 07:00' or 'weekly 1 07:00' or '1 09:00'
    const weeklyMatch = cleanSchedule.match(/^(?:weekly\s+|every\s+)?(?:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|([0-6]))\s+(?:at\s+)?(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (weeklyMatch) {
      const dayName = weeklyMatch[1]?.toLowerCase();
      const dayDigit = weeklyMatch[2];
      let hour = parseInt(weeklyMatch[3], 10);
      const minute = parseInt(weeklyMatch[4], 10);
      const ampm = weeklyMatch[5]?.toLowerCase();

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;

      const dayMap: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };
      const targetDayOfWeek = dayName !== undefined
        ? dayMap[dayName]
        : dayDigit !== undefined
        ? parseInt(dayDigit, 10) % 7
        : 1;

      for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
        const candidateDate = new Date(afterDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const zoned = ScheduleManager.getZonedParts(candidateDate, tz);

        if (zoned.dayOfWeek === targetDayOfWeek) {
          const runDate = ScheduleManager.fromZonedDateTime(
            zoned.year,
            zoned.month,
            zoned.day,
            hour,
            minute,
            0,
            tz,
          );
          if (runDate.getTime() > afterDate.getTime()) {
            return runDate;
          }
        }
      }
    }

    // 5. CRON schedule: normalize and evaluate
    const cronExpr = ScheduleManager.normalizeSchedule(cleanSchedule);
    if (!ScheduleManager.isValidCron(cronExpr)) {
      return null;
    }

    return ScheduleManager.calculateNextCronRun(cronExpr, tz, afterDate);
  }

  /**
   * Evaluates the next occurrence of a standard 5-part cron expression in a target timezone.
   */
  public static calculateNextCronRun(
    cronExpr: string,
    timeZone: string = 'UTC',
    afterDate: Date = new Date(),
  ): Date | null {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minRule, hourRule, domRule, monthRule, dowRule] = parts;

    // Start looking from the next whole minute
    let checkDate = new Date(Math.floor(afterDate.getTime() / 60000) * 60000 + 60000);

    // Safety bound: search up to 366 days into future
    const maxSearchDate = new Date(afterDate.getTime() + 366 * 24 * 60 * 60 * 1000);

    while (checkDate.getTime() <= maxSearchDate.getTime()) {
      const zoned = ScheduleManager.getZonedParts(checkDate, timeZone);

      if (
        ScheduleManager.matchesField(zoned.minute, minRule, 0, 59) &&
        ScheduleManager.matchesField(zoned.hour, hourRule, 0, 23) &&
        ScheduleManager.matchesField(zoned.day, domRule, 1, 31) &&
        ScheduleManager.matchesField(zoned.month, monthRule, 1, 12) &&
        ScheduleManager.matchesField(zoned.dayOfWeek, dowRule, 0, 7)
      ) {
        return checkDate;
      }

      // Step forward efficiently:
      // If hour does not match, advance to next hour
      if (!ScheduleManager.matchesField(zoned.hour, hourRule, 0, 23)) {
        checkDate = new Date(checkDate.getTime() + (60 - zoned.minute) * 60000);
      } else {
        // Advance by 1 minute
        checkDate = new Date(checkDate.getTime() + 60000);
      }
    }

    return null;
  }

  /**
   * Evaluates if a value satisfies a cron field expression.
   */
  private static matchesField(
    val: number,
    rule: string,
    min: number,
    max: number,
  ): boolean {
    if (rule === '*' || rule === '?') return true;

    // Handle 0 or 7 for Sunday
    if (max === 7 && rule.includes('7') && val === 0) val = 7;

    // List: '1,2,3'
    if (rule.includes(',')) {
      return rule.split(',').some((sub) => ScheduleManager.matchesField(val, sub.trim(), min, max));
    }

    // Step: '*/5' or '10-20/2'
    if (rule.includes('/')) {
      const [range, stepStr] = rule.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return false;

      let start = min;
      let end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          const [r1, r2] = range.split('-');
          start = parseInt(r1, 10);
          end = parseInt(r2, 10);
        } else {
          start = parseInt(range, 10);
        }
      }

      if (val < start || val > end) return false;
      return (val - start) % step === 0;
    }

    // Range: '1-5'
    if (rule.includes('-')) {
      const [r1, r2] = rule.split('-');
      const start = parseInt(r1, 10);
      const end = parseInt(r2, 10);
      return val >= start && val <= end;
    }

    // Exact value: '5'
    const exact = parseInt(rule, 10);
    return val === exact;
  }
}
