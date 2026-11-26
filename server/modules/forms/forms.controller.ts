import type {NextFunction, Request, Response} from 'express';
import {hasClubPermission} from '../../middleware/authorization.ts';
import {sendSuccess} from '../../shared/responses/apiResponse.ts';
import type {FormsService} from './forms.service.ts';

export class FormsController {
  constructor(private readonly service: FormsService) {}

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versionParam = req.query.version ? Number(req.query.version) : undefined;
      if (versionParam && Number.isFinite(versionParam)) {
        const snapshot = await this.service.getPublishedVersion(req.params.eventId, versionParam);
        sendSuccess(res, snapshot);
        return;
      }

      const publishedOnly =
        req.query.published === 'true' || req.query.publishedOnly === 'true';
      if (!publishedOnly && req.auth?.user) {
        const event = await this.service.getEventById(req.params.eventId);
        if (event && hasClubPermission(req, event.clubId, 'MANAGE_FORMS')) {
          const draftForm = await this.service.getForm(req.params.eventId);
          sendSuccess(res, draftForm);
          return;
        }
      }

      const publishedForm = await this.service.getLatestPublishedForm(req.params.eventId);
      sendSuccess(res, publishedForm);
    } catch (error) {
      next(error);
    }
  };

  put = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const form = await this.service.saveForm(
        req.params.eventId,
        req.body.fields,
        {
          id: req.auth!.user.id,
          name: req.auth!.user.name,
        },
        {
          title: req.body.title,
          description: req.body.description,
        },
      );
      sendSuccess(res, form);
    } catch (error) {
      next(error);
    }
  };

  publish = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const snapshot = await this.service.publishForm(req.params.eventId, {
        id: req.auth!.user.id,
        name: req.auth!.user.name,
      });
      sendSuccess(res, snapshot, 201);
    } catch (error) {
      next(error);
    }
  };
}
