import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {UsersService} from './users.service.ts';

export class UsersController {
  constructor(private readonly service: UsersService) {}

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.service.getMyProfile(req.auth!.user.id);
      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.updateMyProfile(req.auth!.user.id, req.body);
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  getFollowedClubs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getMyFollowedClubs(req.auth!.user.id);
      sendSuccess(res, result.clubs, 200, {
        count: result.count,
        limit: result.limit,
      });
    } catch (error) {
      next(error);
    }
  };
}
