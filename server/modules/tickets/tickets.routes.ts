import {Router} from 'express';
import {releaseTicketsSchema, revokeTicketSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth, requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {TicketsController} from './tickets.controller.ts';
import {TicketsService} from './tickets.service.ts';

export function createTicketsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new TicketsService(adapter);
  const controller = new TicketsController(service);

  router.post(
    '/events/:eventId/tickets/release',
    requireEventPermission(adapter, 'MANAGE_EVENTS', 'eventId'),
    validateBody(releaseTicketsSchema),
    controller.releaseForEvent,
  );
  router.get(
    '/events/:eventId/tickets',
    requireEventPermission(adapter, 'VIEW_REGISTRATIONS', 'eventId'),
    controller.listForEvent,
  );
  router.get('/tickets/me', requireAuth, controller.listMine);
  router.post(
    '/tickets/:ticketId/revoke',
    requireAuth,
    validateBody(revokeTicketSchema),
    controller.revoke,
  );

  return router;
}
