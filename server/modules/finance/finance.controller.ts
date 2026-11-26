import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {FinanceService} from './finance.service.ts';

export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.service.submitFinancialReport(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, report, 201);
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.service.getFinancialReport(req.params.eventId);
      sendSuccess(res, report);
    } catch (error) {
      next(error);
    }
  };

  getClubFinance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.service.getClubFinanceSummary(req.params.clubId);
      sendSuccess(res, summary);
    } catch (error) {
      next(error);
    }
  };

  createClubEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entry = await this.service.createEntry(
        req.params.clubId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, entry, 201);
    } catch (error) {
      next(error);
    }
  };

  deleteClubEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.deleteEntry(req.params.clubId, req.params.entryId, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, {deleted: true});
    } catch (error) {
      next(error);
    }
  };

  getEventFinance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await this.service.getEventFinanceSummary(req.params.eventId);
      sendSuccess(res, summary);
    } catch (error) {
      next(error);
    }
  };

  createEventEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = req.resolvedEvent!;
      const entry = await this.service.createEntry(
        event.clubId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        {...req.body, eventId: event.id},
      );
      sendSuccess(res, entry, 201);
    } catch (error) {
      next(error);
    }
  };
}
