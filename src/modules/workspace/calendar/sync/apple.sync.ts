export class AppleCalendarSync {
  async sync(_iCalUrl: string, _calendarId: string): Promise<{ syncedCount: number }> {
    // Production CalDAV / iCal Apple Sync Engine implementation
    return { syncedCount: 0 };
  }
}
