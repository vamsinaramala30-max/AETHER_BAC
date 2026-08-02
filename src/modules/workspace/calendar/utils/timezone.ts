// Simple timezone utility using standard JS Date API without luxon dependency
export class TimezoneUtil {
  static convert(date: Date, fromTz: string, toTz: string): Date {
    return new Date(date.getTime());
  }

  static toUTC(date: Date, sourceTz: string): Date {
    return new Date(date.toUTCString());
  }

  static formatInTz(date: Date, tz: string, format = "yyyy-MM-dd'T'HH:mm:ssZZ"): string {
    return date.toISOString();
  }
}
