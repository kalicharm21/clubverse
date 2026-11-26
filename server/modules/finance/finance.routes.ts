import {Router} from 'express';
import {
  createFinanceEntrySchema,
  submitFinancialReportSchema,
} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {
  requireClubPermission,
  requireEventPermission,
} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {FinanceController} from './finance.controller.ts';
import {FinanceService} from './finance.service.ts';

export function createFinanceRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new FinanceService(adapter);
  const controller = new FinanceController(service);

  // Strictly protected: students without SUBMIT_FINANCE_REPORTS cannot access club financial data
  router.post(
    '/events/:eventId/finance-report',
    requireEventPermission(adapter, 'SUBMIT_FINANCE_REPORTS', 'eventId'),
    validateBody(submitFinancialReportSchema),
    controller.submit,
  );
  router.get(
    '/events/:eventId/finance-report',
    requireEventPermission(adapter, 'SUBMIT_FINANCE_REPORTS', 'eventId'),
    controller.get,
  );

  router.get(
    '/clubs/:clubId/finance',
    requireClubPermission('SUBMIT_FINANCE_REPORTS', 'clubId'),
    controller.getClubFinance,
  );
  router.get(
    '/clubs/:clubId/finance/entries',
    requireClubPermission('SUBMIT_FINANCE_REPORTS', 'clubId'),
    controller.getClubFinance,
  );
  router.post(
    '/clubs/:clubId/finance/entries',
    requireClubPermission('SUBMIT_FINANCE_REPORTS', 'clubId'),
    validateBody(createFinanceEntrySchema),
    controller.createClubEntry,
  );
  router.delete(
    '/clubs/:clubId/finance/entries/:entryId',
    requireClubPermission('SUBMIT_FINANCE_REPORTS', 'clubId'),
    controller.deleteClubEntry,
  );

  router.get(
    '/events/:eventId/finance',
    requireEventPermission(adapter, 'SUBMIT_FINANCE_REPORTS', 'eventId'),
    controller.getEventFinance,
  );
  router.post(
    '/events/:eventId/finance/entries',
    requireEventPermission(adapter, 'SUBMIT_FINANCE_REPORTS', 'eventId'),
    validateBody(createFinanceEntrySchema),
    controller.createEventEntry,
  );

  return router;
}
