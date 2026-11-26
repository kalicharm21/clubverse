import {Router} from 'express';
import {
  manualAttendanceSchema,
  scanAttendanceSchema,
} from '../../../shared/schemas/validation.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireEventPermission} from '../../middleware/authorization.ts';
import {validateBody} from '../../middleware/validation.ts';
import {AttendanceController} from './attendance.controller.ts';
import {AttendanceService} from './attendance.service.ts';

export function createAttendanceRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new AttendanceService(adapter);
  const controller = new AttendanceController(service);

  router.post(
    '/events/:eventId/attendance/scan',
    requireEventPermission(adapter, 'SCAN_ATTENDANCE', 'eventId'),
    validateBody(scanAttendanceSchema),
    controller.scan,
  );
  router.post(
    '/events/:eventId/attendance/verify',
    requireEventPermission(adapter, 'SCAN_ATTENDANCE', 'eventId'),
    validateBody(scanAttendanceSchema),
    controller.scan,
  );
  router.post(
    '/events/:eventId/attendance/manual',
    requireEventPermission(adapter, 'SCAN_ATTENDANCE', 'eventId'),
    validateBody(manualAttendanceSchema),
    controller.manual,
  );
  router.get(
    '/events/:eventId/attendance',
    requireEventPermission(adapter, 'SCAN_ATTENDANCE', 'eventId'),
    controller.list,
  );
  router.get(
    '/events/:eventId/attendance/export',
    requireEventPermission(adapter, 'SCAN_ATTENDANCE', 'eventId'),
    controller.exportCsv,
  );

  return router;
}
