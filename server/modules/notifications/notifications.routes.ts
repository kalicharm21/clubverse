import {Router} from 'express';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {requireAuth} from '../../middleware/authorization.ts';
import {NotificationsController} from './notifications.controller.ts';
import {NotificationsService} from './notifications.service.ts';

export function createNotificationsRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new NotificationsService(adapter);
  const controller = new NotificationsController(service);

  router.get('/notifications', requireAuth, controller.list);
  router.patch('/notifications/:notificationId/read', requireAuth, controller.markRead);
  router.post('/notifications/read-all', requireAuth, controller.markAllRead);

  return router;
}
