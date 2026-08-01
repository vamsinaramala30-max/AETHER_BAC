import { DateTime } from 'luxon';

export class TimezoneUtil {
  static convert(date: Date, fromTz: string, toTz: string): Date {
    const dt = DateTime.fromJSDate(date, { zone: fromTz });
    return dt.setZone(toTz).toJSDate();
  }

  static toUTC(date: Date, sourceTz: string): Date {
    return DateTime.fromJSDate(date, { zone: sourceTz }).toUTC().toJSDate();
  }

  static formatInTz(date: Date, tz: string, format = "yyyy-MM-dd'T'HH:mm:ssZZ"): string {
    return DateTime.fromJSDate(date).setZone(tz).toFormat(format);
  }
}