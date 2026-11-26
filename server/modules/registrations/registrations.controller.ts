import type {NextFunction, Request, Response} from 'express';
import {hasClubPermission} from '../../middleware/authorization.ts';
import {ForbiddenError} from '../../shared/errors/AppError.ts';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {RegistrationsService} from './registrations.service.ts';

export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reg = await this.service.registerStudent(
        req.params.eventId,
        req.auth!.user,
        req.body.answers,
      );
      sendSuccess(res, reg, 201);
    } catch (error) {
      next(error);
    }
  };

  cancelMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.cancelStudentRegistration(
        req.params.eventId,
        req.auth!.user,
      );
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  listForEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const hasPagination =
        req.query.page !== undefined ||
        req.query.pageSize !== undefined ||
        req.query.search !== undefined ||
        req.query.status !== undefined;

      if (hasPagination) {
        const result = await this.service.listForEventPaginated(req.params.eventId, {
          page: req.query.page ? Number(req.query.page) : undefined,
          pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
        });
        sendSuccess(res, result.items, 200, {pagination: result.pagination});
        return;
      }

      const list = await this.service.listForEvent(req.params.eventId);
      sendSuccess(res, list);
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {filename, csv} = await this.service.exportCsv(req.params.eventId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  };

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const list = await this.service.listForStudent(req.auth!.user.id);
      sendSuccess(res, list);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reg = await this.service.getRegistrationById(req.params.registrationId);
      const isOwner = reg.studentId === req.auth!.user.id;
      const hasClubAccess = Boolean(
        reg.clubId && hasClubPermission(req, reg.clubId, 'VIEW_REGISTRATIONS'),
      );
      if (!isOwner && !hasClubAccess) {
        throw new ForbiddenError('You do not have permission to view this registration');
      }
      const safeReg =
        isOwner && reg.ticketStatus === 'released' ? reg : {...reg, qrToken: ''};
      sendSuccess(res, safeReg);
    } catch (error) {
      next(error);
    }
  };
}
