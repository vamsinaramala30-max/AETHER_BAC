import { Router } from 'express';
import { CalendarController } from './calendar.controller';
import { validateBody } from './calendar.validators';
import { CreateCalendarSchema, UpdateCalendarSchema } from './calendar.dto';

export function createCalendarRouter(controller: CalendarController): Router {
  const router = Router();

  router.get('/', (req, res, next) => controller.list(req, res, next));
  router.post('/', validateBody(CreateCalendarSchema), (req, res, next) => controller.create(req, res, next));
  router.get('/:id', (req, res, next) => controller.getById(req, res, next));
  router.patch('/:id', validateBody(UpdateCalendarSchema), (req, res, next) => controller.update(req, res, next));
  router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

  return router;
}