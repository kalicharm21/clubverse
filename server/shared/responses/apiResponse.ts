import type {Response} from 'express';
import type {ApiErrorResponse, ApiSuccessResponse} from '../../../shared/types/domain.ts';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): void {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta ? {meta} : {}),
  };
  res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? {details} : {}),
    },
  };
  res.status(statusCode).json(payload);
}
