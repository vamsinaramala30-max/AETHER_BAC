import { CalendarRepository } from './calendar.repository';
import { CreateCalendarDTO, UpdateCalendarDTO } from './calendar.dto';
import { CalendarRole } from './calendar.types';
import { AppError } from '../../../middleware/error.middleware';

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

  async getEvents(params: {
    workspaceId?: string;
    userId?: string;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ data: any[] }> {
    const isUuid = (val?: string | null): boolean =>
      Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

    if (params.workspaceId && !isUuid(params.workspaceId)) {
      throw new AppError('Invalid workspace ID', 400, 'INVALID_WORKSPACE_ID');
    }
    if (params.userId && !isUuid(params.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    // Verify workspace membership when both workspaceId and userId are provided
    if (params.workspaceId && params.userId) {
      const isMember = await this.calendarRepo.checkWorkspaceMembership(
        params.workspaceId,
        params.userId,
      );
      if (!isMember) {
        throw new AppError('Forbidden: Access to workspace calendar denied', 403, 'FORBIDDEN');
      }
    }

    const events = await this.calendarRepo.findEvents(params);
    return { data: events };
  }
}

