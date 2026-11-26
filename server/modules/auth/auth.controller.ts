import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {AuthService} from './auth.service.ts';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  getConfig = (_req: Request, res: Response): void => {
    sendSuccess(res, this.service.getPublicAuthConfig());
  };

  getPersonas = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const personas = await this.service.listDemoPersonas();
      sendSuccess(res, personas);
    } catch (error) {
      next(error);
    }
  };

  loginDemo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.loginDemo(req.body);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  registerDemo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.registerDemo(req.body);
      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = req.auth!;
      if (auth.followedClubIds !== undefined) {
        sendSuccess(res, {
          user: auth.user,
          memberships: auth.memberships,
          followedClubIds: auth.followedClubIds,
          mode: auth.mode,
        });
        return;
      }
      const session = await this.service.getSessionMe(auth.user.id, auth.mode, {
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, session);
    } catch (error) {
      next(error);
    }
  };

  logout = (_req: Request, res: Response): void => {
    sendSuccess(res, {loggedOut: true});
  };
}
