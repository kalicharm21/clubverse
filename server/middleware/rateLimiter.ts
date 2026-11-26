import rateLimit from 'express-rate-limit';
import {env} from '../config/env.ts';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'test' ? 1000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again shortly.',
    },
  },
});

export const mutationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.nodeEnv === 'test' ? 1000 : 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded. Slow down and retry.',
    },
  },
});
