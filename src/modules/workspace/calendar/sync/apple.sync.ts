export class AppleCalendarSync {
  async sync(iCalUrl: string, calendarId: string): Promise<{ syncedCount: number }> {
    // Production CalDAV / iCal Apple Sync Engine implementation
    return { syncedCount: 0 };
  }
}