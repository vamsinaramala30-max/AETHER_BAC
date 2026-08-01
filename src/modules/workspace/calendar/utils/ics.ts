// backend/src/modules/calendar/utils/ics.ts

import { ExpandedEvent } from '../calendar.types';

export class ICSExporter {
  public static generateICS(events: ExpandedEvent[]): string {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Enterprise Calendar Engine//EN',
      'CALSCALE:GREGORIAN'
    ];

    for (const evt of events) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${evt.id}`,
        `DTSTAMP:${this.formatDate(new Date())}`,
        `DTSTART:${this.formatDate(new Date(evt.start))}`,
        `DTEND:${this.formatDate(new Date(evt.end))}`,
        `SUMMARY:${this.escapeText(evt.title)}`,
        `DESCRIPTION:${this.escapeText(evt.description || '')}`,
        `LOCATION:${this.escapeText(evt.location || '')}`,
        'END:VEVENT'
      );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  private static formatDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  private static escapeText(str: string): string {
    return str.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\n/g, '\\n');
  }
}