import {Router} from 'express';
import {
  updateMemberPermissionsSchema,
  upsertClubMemberSchema,
} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth, requireClubAdmin} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {MembershipsController} from './memberships.controller.ts';
import {MembershipsService} from './memberships.service.ts';

export function createMembershipsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new MembershipsService(adapter);
  const controller = new MembershipsController(service);

  router.get('/memberships/me', requireAuth, controller.getMe);
  router.post('/clubs/:clubId/follow', requireAuth, controller.follow);
  router.delete('/clubs/:clubId/follow', requireAuth, controller.unfollow);

  router.get('/clubs/:clubId/members', requireClubAdmin('clubId'), controller.listTeam);
  router.post(
    '/clubs/:clubId/members',
    requireClubAdmin('clubId'),
    validateBody(upsertClubMemberSchema),
    controller.upsertMember,
  );
  router.patch(
    '/clubs/:clubId/members/:membershipId',
    requireClubAdmin('clubId'),
    validateBody(updateMemberPermissionsSchema),
    controller.updatePermissions,
  );
  router.delete(
    '/clubs/:clubId/members/:membershipId',
    requireClubAdmin('clubId'),
    controller.removeMember,
  );

  return router;
}
