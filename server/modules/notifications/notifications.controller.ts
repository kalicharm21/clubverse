import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {NotificationsService} from './notifications.service.ts';

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.service.listForUser(req.auth!.user.id);
      sendSuccess(res, items);
    } catch (error) {
      next(error);
    }
  };

  markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.service.markRead(req.auth!.user.id, req.params.notificationId);
      sendSuccess(res, item);
    } catch (error) {
      next(error);
    }
  };

  markAllRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.markAllRead(req.auth!.user.id);
      sendSuccess(res, {markedAllRead: true});
    } catch (error) {
      next(error);
    }
  };
}
