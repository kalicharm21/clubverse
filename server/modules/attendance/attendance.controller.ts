import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {AttendanceService} from './attendance.service.ts';

export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  scan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const record = await this.service.scanAttendance(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, record, 201);
    } catch (error) {
      next(error);
    }
  };

  manual = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const record = await this.service.scanAttendance(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        {
          registrationId: req.body.registrationId,
          method: 'manual_override',
          reason: req.body.reason,
        },
      );
      sendSuccess(res, record, 201);
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const summary = await this.service.listAttendance(req.params.eventId, {
        page,
        pageSize,
        search,
      });
      sendSuccess(res, summary);
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
}
