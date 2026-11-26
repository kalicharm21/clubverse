import {Router} from 'express';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {HallOfFameController} from './hallOfFame.controller.ts';
import {HallOfFameService} from './hallOfFame.service.ts';

export function createHallOfFameRoutes(adapter: DataAdapter): Router {
  const router = Router();
  const service = new HallOfFameService(adapter);
  const controller = new HallOfFameController(service);

  router.get('/hall-of-fame', controller.list);

  return router;
}
