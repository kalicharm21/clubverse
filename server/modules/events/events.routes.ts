import {Router} from 'express';
import {createEventSchema, updateEventSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireClubPermission, requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {EventsController} from './events.controller.ts';
import {EventsService} from './events.service.ts';

export function createEventsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new EventsService(adapter);
  const controller = new EventsController(service);

  router.get('/events', controller.list);
  router.get('/events/:eventId', controller.detail);

  router.post(
    '/clubs/:clubId/events',
    requireClubPermission('MANAGE_EVENTS', 'clubId'),
    validateBody(createEventSchema),
    controller.create,
  );
  router.patch(
    '/events/:eventId',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    validateBody(updateEventSchema),
    controller.update,
  );
  router.post(
    '/events/:eventId/publish',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    controller.publish,
  );
  router.post(
    '/events/:eventId/unpublish',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    controller.unpublish,
  );
  router.post(
    '/events/:eventId/open-registration',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    controller.openRegistration,
  );
  router.post(
    '/events/:eventId/close-registration',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    controller.closeRegistration,
  );
  router.post(
    '/events/:eventId/cancel',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    controller.cancel,
  );
  router.post(
    '/events/:eventId/complete',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    controller.complete,
  );

  return router;
}
