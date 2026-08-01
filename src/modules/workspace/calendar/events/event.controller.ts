import { Request, Response, NextFunction } from 'express';
import { EventService } from './event.service';
import { CalendarMapper } from '../calendar.mapper';
import { IcsConverter } from '../utils/ics';
import { ParticipantStatus } from '@prisma/client';

export class EventController {
  constructor(private eventService: EventService) {}

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const event = await this.eventService.createEvent(userId, req.body);
      res.status(201).json({ data: CalendarMapper.toEventResponse(event) });
    } catch (err) { next(err); }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const calendarIds = (req.query.calendarIds as string || '').split(',').filter(Boolean);
      const start = new Date(req.query.start as string);
      const end = new Date(req.query.end as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ error: 'Valid "start" and "end" ISO date strings are required' });
        return;
      }

      const events = await this.eventService.getEventsInWindow(userId, calendarIds, start, end);
      res.status(200).json({ data: events.map(CalendarMapper.toEventResponse) });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const event = await this.eventService.updateEvent(userId, req.params.id, req.body);
      res.status(200).json({ data: CalendarMapper.toEventResponse(event) });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      await this.eventService.deleteEvent(userId, req.params.id);
      res.status(204).send();
    } catch (err) { next(err); }
  }

  async respond(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { status } = req.body;
      await this.eventService.respondToInvitation(userId, req.params.id, status as ParticipantStatus);
      res.status(200).json({ message: 'Response recorded successfully' });
    } catch (err) { next(err); }
  }

  async exportIcs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const calendarIds = (req.query.calendarIds as string || '').split(',').filter(Boolean);
      const start = new Date(req.query.start as string || '2000-01-01');
      const end = new Date(req.query.end as string || '2100-01-01');

      const events = await this.eventService.getEventsInWindow(userId, calendarIds, start, end);
      const icsData = IcsConverter.exportToIcs(events);

      res.setHeader('Content-Type', 'text/calendar');
      res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
      res.status(200).send(icsData);
    } catch (err) { next(err); }
  }
}