import {Router} from 'express';
import {submitRegistrationSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth, requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {RegistrationsController} from './registrations.controller.ts';
import {RegistrationsService} from './registrations.service.ts';

export function createRegistrationsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new RegistrationsService(adapter);
  const controller = new RegistrationsController(service);

  router.post(
    '/events/:eventId/registrations',
    requireAuth,
    validateBody(submitRegistrationSchema),
    controller.create,
  );
  router.get(
    '/events/:eventId/registrations',
    requireEventPermission(adapter, 'VIEW_REGISTRATIONS', 'eventId'),
    controller.listForEvent,
  );
  router.get(
    '/events/:eventId/registrations/export',
    requireEventPermission(adapter, 'VIEW_REGISTRATIONS', 'eventId'),
    controller.exportCsv,
  );
  router.delete(
    '/events/:eventId/registrations/me',
    requireAuth,
    controller.cancelMine,
  );
  router.get('/registrations/me', requireAuth, controller.listMine);
  router.get('/users/me/registrations', requireAuth, controller.listMine);
  router.get('/registrations/:registrationId', requireAuth, controller.getById);

  return router;
}
