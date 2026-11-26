import type {NextFunction, Request, Response} from 'express';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {EventsService} from './events.service.ts';

export class EventsController {
  constructor(private readonly service: EventsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const clubId = typeof req.query.clubId === 'string' ? req.query.clubId : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const upcomingOnly = req.query.upcomingOnly === 'true';
      const hasPagination =
        req.query.page !== undefined || req.query.pageSize !== undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;

      if (hasPagination) {
        const result = await this.service.listEventsPaginated({
          search,
          category,
          clubId,
          status,
          upcomingOnly,
          page,
          pageSize,
        });
        sendSuccess(res, result.items, 200, {pagination: result.pagination});
        return;
      }

      const events = await this.service.listEvents({
        search,
        category,
        clubId,
        status,
        upcomingOnly,
      });
      sendSuccess(res, events);
    } catch (error) {
      next(error);
    }
  };

  detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = await this.service.getEventById(req.params.eventId);
      sendSuccess(res, event);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = await this.service.createEvent(
        req.params.clubId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, event, 201);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.updateEvent(
        req.params.eventId,
        {id: req.auth!.user.id, name: req.auth!.user.name},
        req.body,
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  publish = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const published = await this.service.publishEvent(req.params.eventId, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, published);
    } catch (error) {
      next(error);
    }
  };

  unpublish = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.transitionLifecycle(req.params.eventId, 'draft', {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  openRegistration = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.transitionLifecycle(
        req.params.eventId,
        'registration_open',
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
        },
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  closeRegistration = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.transitionLifecycle(
        req.params.eventId,
        'registration_closed',
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
        },
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.transitionLifecycle(req.params.eventId, 'cancelled', {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  complete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.transitionLifecycle(req.params.eventId, 'completed', {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };
}
