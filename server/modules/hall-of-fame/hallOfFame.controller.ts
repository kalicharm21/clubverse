import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {HallOfFameService} from './hallOfFame.service.ts';

export class HallOfFameController {
  constructor(private readonly service: HallOfFameService) {}

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rankings = await this.service.getRankings();
      sendSuccess(res, rankings);
    } catch (error) {
      next(error);
    }
  };
}
