import {Router} from 'express';
import {
  createClubSchema,
  updateClubSchema,
  updateClubStatusSchema,
} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireClubAdmin, requireSuperAdmin} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {ClubsController} from './clubs.controller.ts';
import {ClubsService} from './clubs.service.ts';

export function createClubsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new ClubsService(adapter);
  const controller = new ClubsController(service);

  router.get('/clubs', controller.list);
  router.get('/clubs/:clubId', controller.detail);
  router.post('/clubs', requireSuperAdmin, validateBody(createClubSchema), controller.create);
  router.patch(
    '/clubs/:clubId',
    requireClubAdmin('clubId'),
    validateBody(updateClubSchema),
    controller.update,
  );
  router.patch(
    '/clubs/:clubId/status',
    requireSuperAdmin,
    validateBody(updateClubStatusSchema),
    controller.updateStatus,
  );

  return router;
}
