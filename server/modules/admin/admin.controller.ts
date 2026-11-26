import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {AdminService} from './admin.service.ts';

export class AdminController {
  constructor(private readonly service: AdminService) {}

  dashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await this.service.getDashboard();
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  };

  analytics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getAnalytics();
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  clubs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const clubs = await this.service.listAllClubs(
        status && ['active', 'inactive', 'suspended', 'pending_review'].includes(status)
          ? (status as 'active' | 'inactive' | 'suspended' | 'pending_review')
          : undefined,
      );
      sendSuccess(res, clubs);
    } catch (error) {
      next(error);
    }
  };

  memberships = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const memberships = await this.service.listAllMemberships();
      sendSuccess(res, memberships);
    } catch (error) {
      next(error);
    }
  };

  updateClubStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const club = await this.service.updateClubStatus(
        req.params.clubId,
        req.body.status,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body.reason,
      );
      sendSuccess(res, club);
    } catch (error) {
      next(error);
    }
  };

  users = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await this.service.listUsers();
      sendSuccess(res, users);
    } catch (error) {
      next(error);
    }
  };

  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.service.updateUserStatus(
        req.params.userId,
        req.body.status,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body.reason,
      );
      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  };

  reports = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reports = await this.service.listAllEventReports();
      sendSuccess(res, reports);
    } catch (error) {
      next(error);
    }
  };

  reviewReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.service.reviewEventReport(
        req.params.reportId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, report);
    } catch (error) {
      next(error);
    }
  };

  exportReportsCsv = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {filename, csv} = await this.service.exportReportsCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  };

  finance = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const finance = await this.service.listAllFinancialReports();
      sendSuccess(res, finance);
    } catch (error) {
      next(error);
    }
  };

  exportFinanceCsv = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {filename, csv} = await this.service.exportFinanceCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  };

  auditLogs = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const logs = await this.service.listAuditLogs();
      sendSuccess(res, logs);
    } catch (error) {
      next(error);
    }
  };

  getSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.service.getSettings();
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.service.updateSettings(req.body, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  };
}
