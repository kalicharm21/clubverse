import type {NextFunction, Request, Response} from 'express';

const SLOW_REQUEST_THRESHOLD_MS = 200;

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  const start = performance.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api/')) return;
    const durationMs = Math.round(performance.now() - start);
    // Never log authorization headers, tokens, invitation tokens, QR tokens, or credentials
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'slow_http_request',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
          requestId: req.requestId || null,
        }),
      );
    }
  });
  next();
}
