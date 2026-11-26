import type {NextFunction, Request, Response} from 'express';
import type {ZodType} from 'zod';
import {ValidationError} from '../shared/errors/AppError.ts';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new ValidationError('Request validation failed', parsed.error.flatten().fieldErrors),
      );
    }
    req.body = parsed.data;
    next();
  };
}
