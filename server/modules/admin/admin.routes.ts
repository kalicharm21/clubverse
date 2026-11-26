import {Router} from 'express';
import {
  reviewEventReportSchema,
  updateClubStatusSchema,
  updateSystemSettingsSchema,
  updateUserStatusSchema,
} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireSuperAdmin} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {AdminController} from './admin.controller.ts';
import {AdminService} from './admin.service.ts';

export function createAdminRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new AdminService(adapter);
  const controller = new AdminController(service);

  router.use('/admin', requireSuperAdmin);

  router.get('/admin/dashboard', controller.dashboard);
  router.get('/admin/analytics', controller.analytics);
  router.get('/admin/clubs', controller.clubs);
  router.patch('/admin/clubs/:clubId/status', validateBody(updateClubStatusSchema), controller.updateClubStatus);
  router.get('/admin/memberships', controller.memberships);
  router.get('/admin/users', controller.users);
  router.patch('/admin/users/:userId/status', validateBody(updateUserStatusSchema), controller.updateUserStatus);
  router.get('/admin/reports', controller.reports);
  router.get('/admin/reports/export', controller.exportReportsCsv);
  router.post(
    '/admin/reports/:reportId/review',
    validateBody(reviewEventReportSchema),
    controller.reviewReport,
  );
  router.get('/admin/finance', controller.finance);
  router.get('/admin/finance/export', controller.exportFinanceCsv);
  router.get('/admin/audit-logs', controller.auditLogs);
  router.get('/admin/settings', controller.getSettings);
  router.patch('/admin/settings', validateBody(updateSystemSettingsSchema), controller.updateSettings);

  return router;
}
