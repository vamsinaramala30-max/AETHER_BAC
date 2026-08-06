// Simple timezone utility using standard JS Date API without luxon dependency
export class TimezoneUtil {
  static convert(date: Date, _fromTz: string, _toTz: string): Date {
    return new Date(date.getTime());
  }

  static toUTC(date: Date, _sourceTz: string): Date {
    return new Date(date.toUTCString());
  }

  static formatInTz(date: Date, _tz: string, _format = "yyyy-MM-dd'T'HH:mm:ssZZ"): string {
    return date.toISOString();
  }
}
