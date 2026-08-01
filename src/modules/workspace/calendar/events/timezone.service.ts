import { TimezoneUtil } from '../utils/timezone';

export class TimezoneService {
  normalizeEventTimes(startTime: Date, endTime: Date, sourceTz: string) {
    return {
      utcStart: TimezoneUtil.toUTC(startTime, sourceTz),
      utcEnd: TimezoneUtil.toUTC(endTime, sourceTz),
    };
  }
}