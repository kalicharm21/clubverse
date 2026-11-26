import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {ReportsService} from './reports.service.ts';

export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = req.resolvedEvent;
      const membership = event
        ? req.auth?.memberships.find((m) => m.clubId === event.clubId)
        : undefined;
      const actorRole = req.auth?.user.isSuperAdmin
        ? 'Super Admin'
        : membership?.title || membership?.role || 'Club Officer';
      const report = await this.service.submitEventReport(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name, role: actorRole},
        req.body,
      );
      sendSuccess(res, report, 201);
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.service.getEventReport(req.params.eventId);
      sendSuccess(res, report);
    } catch (error) {
      next(error);
    }
  };
}
