import type {NextFunction, Request, Response} from 'express';
import {hasClubPermission} from '../../middleware/authorization.ts';
import {ForbiddenError} from '../../shared/errors/AppError.ts';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {TicketsService} from './tickets.service.ts';

export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  releaseForEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.service.releaseForEvent(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body?.confirmParticipantCount,
        req.body?.note,
      );
      sendSuccess(res, summary, 200);
    } catch (error) {
      next(error);
    }
  };

  listForEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tickets = await this.service.listForEvent(req.params.eventId);
      sendSuccess(res, tickets);
    } catch (error) {
      next(error);
    }
  };

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tickets = await this.service.listMine(req.auth!.user.id);
      sendSuccess(res, tickets);
    } catch (error) {
      next(error);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {event} = await this.service.getByIdWithEvent(req.params.ticketId);
      if (!hasClubPermission(req, event.clubId, 'MANAGE_EVENTS')) {
        throw new ForbiddenError(
          `You do not have MANAGE_EVENTS permission for ${event.clubName}`,
        );
      }
      const updated = await this.service.revoke(
        req.params.ticketId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body?.reason,
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };
}
