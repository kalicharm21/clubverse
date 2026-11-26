import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {MembershipsService} from './memberships.service.ts';

export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getMyMembershipsAndFollows(req.auth!.user.id);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  follow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const follow = await this.service.followClub(
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.params.clubId,
      );
      sendSuccess(res, follow, 201);
    } catch (error) {
      next(error);
    }
  };

  unfollow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.unfollowClub(
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.params.clubId,
      );
      sendSuccess(res, {unfollowed: true});
    } catch (error) {
      next(error);
    }
  };

  listTeam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const team = await this.service.getClubTeam(req.params.clubId);
      sendSuccess(res, team);
    } catch (error) {
      next(error);
    }
  };

  upsertMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const member = await this.service.upsertClubMember(
        req.params.clubId,
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
          isSuperAdmin: req.auth!.user.isSuperAdmin,
        },
        req.body,
      );
      sendSuccess(res, member, 201);
    } catch (error) {
      next(error);
    }
  };

  updatePermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.updateMemberPermissions(
        req.params.clubId,
        req.params.membershipId,
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
          isSuperAdmin: req.auth!.user.isSuperAdmin,
        },
        req.body,
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.removeClubMember(req.params.clubId, req.params.membershipId, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
        isSuperAdmin: req.auth!.user.isSuperAdmin,
      });
      sendSuccess(res, {removed: true});
    } catch (error) {
      next(error);
    }
  };
}
