import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {InvitationsService} from './invitations.service.ts';

export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  assignLeadership = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.assignLeadership(
        req.params.clubId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, result, result.mode === 'invited' ? 201 : 200);
    } catch (error) {
      next(error);
    }
  };

  listForClub = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const list = await this.service.listClubInvitations(req.params.clubId);
      sendSuccess(res, list);
    } catch (error) {
      next(error);
    }
  };

  createForClub = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invitation = await this.service.createInvitation(
        req.params.clubId,
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
          isSuperAdmin: req.auth!.user.isSuperAdmin,
          memberships: req.auth!.memberships,
        },
        req.body,
      );
      sendSuccess(res, invitation, 201);
    } catch (error) {
      next(error);
    }
  };

  resend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resent = await this.service.resendInvitation(
        req.params.clubId,
        req.params.invitationId,
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
          isSuperAdmin: req.auth!.user.isSuperAdmin,
        },
      );
      sendSuccess(res, resent);
    } catch (error) {
      next(error);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const revoked = await this.service.revokeInvitation(
        req.params.clubId,
        req.params.invitationId,
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
          isSuperAdmin: req.auth!.user.isSuperAdmin,
        },
      );
      sendSuccess(res, revoked);
    } catch (error) {
      next(error);
    }
  };

  preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const result = await this.service.previewInvitation(token);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  accept = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.acceptInvitation({
        token: req.body.token,
        authUserId: req.auth!.authUserId || req.auth!.user.id,
        user: req.auth!.user,
        name: req.body.name,
        department: req.body.department,
        yearOfStudy: req.body.yearOfStudy,
      });
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };
}
