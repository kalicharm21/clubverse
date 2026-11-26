import {Router} from 'express';
import {submitEventReportSchema} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {ReportsController} from './reports.controller.ts';
import {ReportsService} from './reports.service.ts';

export function createReportsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new ReportsService(adapter);
  const controller = new ReportsController(service);

  router.post(
    '/events/:eventId/report',
    requireEventPermission(adapter, 'SUBMIT_EVENT_REPORTS', 'eventId'),
    validateBody(submitEventReportSchema),
    controller.submit,
  );
  router.get(
    '/events/:eventId/report',
    requireEventPermission(adapter, 'SUBMIT_EVENT_REPORTS', 'eventId'),
    controller.get,
  );

  return router;
}
