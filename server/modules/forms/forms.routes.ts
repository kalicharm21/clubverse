import {Router} from 'express';
import {updateRegistrationFormSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {FormsController} from './forms.controller.ts';
import {FormsService} from './forms.service.ts';

export function createFormsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new FormsService(adapter);
  const controller = new FormsController(service);

  router.get('/events/:eventId/form', controller.get);
  router.put(
    '/events/:eventId/form',
    requireEventPermission(adapter, 'MANAGE_FORMS', 'eventId'),
    validateBody(updateRegistrationFormSchema),
    controller.put,
  );
  router.post(
    '/events/:eventId/form/publish',
    requireEventPermission(adapter, 'MANAGE_FORMS', 'eventId'),
    controller.publish,
  );

  return router;
}
