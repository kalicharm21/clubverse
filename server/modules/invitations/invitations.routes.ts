import {Router} from 'express';
import {
  acceptInvitationSchema,
  assignLeadershipSchema,
  createInvitationSchema,
} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {
  requireAuth,
  requireClubAdmin,
  requireSuperAdmin,
} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {InvitationsController} from './invitations.controller.ts';
import {InvitationsService} from './invitations.service.ts';

export function createInvitationsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new InvitationsService(adapter);
  const controller = new InvitationsController(service);

  router.post(
    '/admin/clubs/:clubId/leadership',
    requireSuperAdmin,
    validateBody(assignLeadershipSchema),
    controller.assignLeadership,
  );

  router.get('/clubs/:clubId/invitations', requireClubAdmin('clubId'), controller.listForClub);
  router.post(
    '/clubs/:clubId/invitations',
    requireClubAdmin('clubId'),
    validateBody(createInvitationSchema),
    controller.createForClub,
  );
  router.post(
    '/clubs/:clubId/invitations/:invitationId/resend',
    requireClubAdmin('clubId'),
    controller.resend,
  );
  router.delete(
    '/clubs/:clubId/invitations/:invitationId',
    requireClubAdmin('clubId'),
    controller.revoke,
  );

  router.get('/invitations/preview', controller.preview);
  router.post(
    '/invitations/accept',
    requireAuth,
    validateBody(acceptInvitationSchema),
    controller.accept,
  );

  return router;
}
