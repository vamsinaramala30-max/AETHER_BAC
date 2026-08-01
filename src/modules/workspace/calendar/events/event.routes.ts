import { Router } from 'express';
import { EventController } from './event.controller';
import { validateEventPayload } from './event.validators';
import { CreateEventSchema, UpdateEventSchema, RespondInvitationSchema } from '../calendar.dto';

export function createEventRouter(controller: EventController): Router {
  const router = Router();

  router.get('/', (req, res, next) => controller.list(req, res, next));
  router.get('/export', (req, res, next) => controller.exportIcs(req, res, next));
  router.post('/', validateEventPayload(CreateEventSchema), (req, res, next) => controller.create(req, res, next));
  router.patch('/:id', validateEventPayload(UpdateEventSchema), (req, res, next) => controller.update(req, res, next));
  router.delete('/:id', (req, res, next) => controller.delete(req, res, next));
  router.post('/:id/respond', validateEventPayload(RespondInvitationSchema), (req, res, next) => controller.respond(req, res, next));

  return router;
}