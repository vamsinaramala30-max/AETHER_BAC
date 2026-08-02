import { Request, Response, NextFunction } from 'express';
import { CalendarService } from './calendar.service';
import { CalendarMapper } from './calendar.mapper';

export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const calendar = await this.calendarService.createCalendar(userId, req.body);
      res.status(201).json({ data: CalendarMapper.toCalendarResponse(calendar) });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const calendars = await this.calendarService.getUserCalendars(userId);
      res.status(200).json({ data: calendars.map((c) => CalendarMapper.toCalendarResponse(c)) });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const calendar = await this.calendarService.getCalendarById(req.params.id, userId);
      res.status(200).json({ data: CalendarMapper.toCalendarResponse(calendar!) });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const calendar = await this.calendarService.updateCalendar(req.params.id, userId, req.body);
      res.status(200).json({ data: CalendarMapper.toCalendarResponse(calendar) });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      await this.calendarService.deleteCalendar(req.params.id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
