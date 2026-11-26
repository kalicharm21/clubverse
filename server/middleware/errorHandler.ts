import type {NextFunction, Request, Response} from 'express';
import {AppError} from '../shared/errors/AppError.ts';
import {sendError} from '../shared/responses/apiResponse.ts';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  const errObj = err as {code?: string; message?: string; cause?: {code?: string; message?: string}};
  const pgCode = errObj?.cause?.code || errObj?.code;
  if (
    pgCode &&
    ['28P01', '28000', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'ENOTFOUND', '57P01', '57P03'].includes(
      pgCode,
    )
  ) {
    console.error(`[Database Error ${pgCode}]`, errObj?.cause?.message || errObj?.message || 'Database error');
    sendError(
      res,
      503,
      'DATABASE_UNAVAILABLE',
      'Database service is temporarily unavailable. Check database credentials and connectivity.',
    );
    return;
  }

  console.error('[Unhandled Server Error]', err instanceof Error ? err.message : 'Unknown error');
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected server error occurred');
}
