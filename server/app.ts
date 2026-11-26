import compression from 'compression';
import cors from 'cors';
import express, {type Express, Router} from 'express';
import helmet from 'helmet';
import type {DataAdapter} from './adapters/DataAdapter.ts';
import {demoDataAdapter} from './adapters/DemoDataAdapter.ts';
import {API_PREFIX} from './config/constants.ts';
import {env} from './config/env.ts';
import {createAuthenticationMiddleware} from './middleware/authentication.ts';
import {errorHandler} from './middleware/errorHandler.ts';
import {mutationRateLimiter} from './middleware/rateLimiter.ts';
import {requestLogger} from './middleware/requestLogger.ts';
import {createAdminRoutes} from './modules/admin/admin.routes.ts';
import {createAttendanceRoutes} from './modules/attendance/attendance.routes.ts';
import {createAuthRoutes} from './modules/auth/auth.routes.ts';
import {createClubsRoutes} from './modules/clubs/clubs.routes.ts';
import {createEventsRoutes} from './modules/events/events.routes.ts';
import {createFinanceRoutes} from './modules/finance/finance.routes.ts';
import {createFormsRoutes} from './modules/forms/forms.routes.ts';
import {createHallOfFameRoutes} from './modules/hall-of-fame/hallOfFame.routes.ts';
import {createInvitationsRoutes} from './modules/invitations/invitations.routes.ts';
import {createMembershipsRoutes} from './modules/memberships/memberships.routes.ts';
import {createNotificationsRoutes} from './modules/notifications/notifications.routes.ts';
import {createRegistrationsRoutes} from './modules/registrations/registrations.routes.ts';
import {createReportsRoutes} from './modules/reports/reports.routes.ts';
import {createTicketsRoutes} from './modules/tickets/tickets.routes.ts';
import {createUsersRoutes} from './modules/users/users.routes.ts';
import {sendError, sendSuccess} from './shared/responses/apiResponse.ts';

function isCacheablePublicRead(req: express.Request): boolean {
  if (req.method !== 'GET') return false;
  if (req.headers.authorization) return false;
  const p = req.path;
  if (p === '/clubs' || p === '/hall-of-fame' || p === '/events' || p === '/auth/config') {
    return true;
  }
  if (/^\/clubs\/[^/]+$/.test(p)) return true;
  if (/^\/events\/[^/]+$/.test(p)) return true;
  if (/^\/events\/[^/]+\/form$/.test(p)) return true;
  return false;
}

export function createApp(adapter: DataAdapter = demoDataAdapter): Express {
  const app = express();
  app.set('trust proxy', 1);

  app.use(compression({threshold: 1024}));

  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          env.corsAllowedOrigins.includes(origin) ||
          origin.endsWith('.run.app') ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ) {
          return callback(null, true);
        }
        return callback(new Error('Origin not allowed by CORS policy'));
      },
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(express.json({limit: '1mb'}));
  app.use(requestLogger);
  app.use(createAuthenticationMiddleware(adapter));

  const apiRouter = Router();
  const persistenceMode = adapter.getPersistenceMode();

  apiRouter.use((req, res, next) => {
    if (isCacheablePublicRead(req)) {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  });

  apiRouter.get('/health', (_req, res) => {
    sendSuccess(res, {
      status: 'ok',
      service: 'campusverse-api',
      phase: 'phase-5',
      mode: persistenceMode === 'in_memory_demo' ? 'demo' : 'production',
      persistence: persistenceMode === 'postgres' ? 'postgresql-drizzle-rls' : 'in-memory-demo-adapter',
      timestamp: new Date().toISOString(),
    });
  });

  apiRouter.get('/health/ready', async (_req, res) => {
    const check = await adapter.checkReadiness();
    if (!check.ready) {
      return sendError(
        res,
        503,
        'DATABASE_UNAVAILABLE',
        env.isProduction
          ? 'Database readiness check failed'
          : check.error || 'Database readiness check failed',
        {persistence: check.persistence, latencyMs: check.latencyMs},
      );
    }
    return sendSuccess(res, {
      status: 'ready',
      service: 'campusverse-api',
      phase: 'phase-5',
      persistence: check.persistence,
      latencyMs: check.latencyMs,
      timestamp: new Date().toISOString(),
    });
  });

  apiRouter.use(mutationRateLimiter);
  apiRouter.use(createAuthRoutes(adapter));
  apiRouter.use(createUsersRoutes(adapter));
  apiRouter.use(createClubsRoutes(adapter));
  apiRouter.use(createMembershipsRoutes(adapter));
  apiRouter.use(createInvitationsRoutes(adapter));
  apiRouter.use(createHallOfFameRoutes(adapter));
  apiRouter.use(createEventsRoutes(adapter));
  apiRouter.use(createFormsRoutes(adapter));
  apiRouter.use(createRegistrationsRoutes(adapter));
  apiRouter.use(createTicketsRoutes(adapter));
  apiRouter.use(createAttendanceRoutes(adapter));
  apiRouter.use(createReportsRoutes(adapter));
  apiRouter.use(createFinanceRoutes(adapter));
  apiRouter.use(createNotificationsRoutes(adapter));
  apiRouter.use(createAdminRoutes(adapter));

  apiRouter.use((_req, res) => {
    sendError(res, 404, 'ENDPOINT_NOT_FOUND', 'API endpoint does not exist');
  });

  app.use(API_PREFIX, apiRouter);
  app.use(errorHandler);

  return app;
}
