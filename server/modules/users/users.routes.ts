import {Router} from 'express';
import {patchProfileSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {UsersController} from './users.controller.ts';
import {UsersService} from './users.service.ts';

export function createUsersRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new UsersService(adapter);
  const controller = new UsersController(service);

  router.get('/users/me', requireAuth, controller.getMe);
  router.patch('/users/me', requireAuth, validateBody(patchProfileSchema), controller.updateMe);
  router.get('/users/me/followed-clubs', requireAuth, controller.getFollowedClubs);

  return router;
}
