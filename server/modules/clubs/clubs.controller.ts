import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {ClubsService} from './clubs.service.ts';

export class ClubsController {
  constructor(private readonly service: ClubsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const sortBy =
        req.query.sortBy === 'name' || req.query.sortBy === 'events'
          ? req.query.sortBy
          : 'followers';
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;

      if (page || pageSize) {
        const result = await this.service.listClubsPaginated({
          search,
          category,
          sortBy,
          page: Number.isFinite(page) ? page : 1,
          pageSize: Number.isFinite(pageSize) ? pageSize : 24,
        });
        sendSuccess(res, result.items, 200, {
          pagination: result.pagination,
        });
        return;
      }

      const clubs = await this.service.listClubs({search, category, sortBy});
      sendSuccess(res, clubs);
    } catch (error) {
      next(error);
    }
  };

  detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const club = await this.service.getClubDetail(req.params.clubId, req.auth?.user.id);
      sendSuccess(res, club);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const club = await this.service.createClub(
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, club, 201);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.updateClub(
        req.params.clubId,
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
          isSuperAdmin: req.auth!.user.isSuperAdmin,
        },
        req.body,
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.updateClubStatus(
        req.params.clubId,
        req.body.status,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body.reason,
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };
}
