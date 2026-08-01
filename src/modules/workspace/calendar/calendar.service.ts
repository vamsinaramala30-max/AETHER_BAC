import { CalendarRepository } from './calendar.repository';
import { CreateCalendarDTO, UpdateCalendarDTO } from './calendar.dto';
import { CalendarRole } from './calendar.types';

export class CalendarService {
  constructor(private calendarRepo: CalendarRepository) {}

  async createCalendar(userId: string, dto: CreateCalendarDTO) {
    return this.calendarRepo.create({
      ...dto,
      members: {
        create: { userId, accessRole: CalendarRole.OWNER },
      },
    });
  }

  async getUserCalendars(userId: string) {
    return this.calendarRepo.findByUserId(userId);
  }

  async getCalendarById(calendarId: string, userId: string) {
    const role = await this.calendarRepo.getUserRole(calendarId, userId);
    if (!role) throw new Error('Unauthorized calendar access');
    return this.calendarRepo.findById(calendarId);
  }

  async updateCalendar(calendarId: string, userId: string, dto: UpdateCalendarDTO) {
    const role = await this.calendarRepo.getUserRole(calendarId, userId);
    if (role !== CalendarRole.OWNER && role !== CalendarRole.EDITOR) {
      throw new Error('Insufficient privileges to modify calendar');
    }
    return this.calendarRepo.update(calendarId, dto);
  }

  async deleteCalendar(calendarId: string, userId: string) {
    const role = await this.calendarRepo.getUserRole(calendarId, userId);
    if (role !== CalendarRole.OWNER) {
      throw new Error('Only the calendar owner can delete it');
    }
    return this.calendarRepo.delete(calendarId);
  }
}