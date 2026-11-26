import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import type {DataAdapter} from './server/adapters/DataAdapter.ts';
import {demoDataAdapter} from './server/adapters/DemoDataAdapter.ts';
import {PostgresDataAdapter} from './server/adapters/PostgresDataAdapter.ts';
import {createApp} from './server/app.ts';
import {API_PREFIX} from './server/config/constants.ts';
import {env} from './server/config/env.ts';
import {closeDbPool} from './server/db/index.ts';
import {sendError, sendSuccess} from './server/shared/responses/apiResponse.ts';

const NO_HMR_CLIENT_MODULE = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const {search, hash} = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`;

function createUnconfiguredApp(): express.Express {
  const app = express();
  app.get(`${API_PREFIX}/health/ready`, (_req, res) => {
    sendError(
      res,
      503,
      'DATABASE_NOT_CONFIGURED',
      'PostgreSQL database URL is not configured in Secrets. Set DATABASE_URL (and SUPABASE_URL / VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).',
    );
  });
  app.get(`${API_PREFIX}/health`, (_req, res) => {
    sendSuccess(res, {
      status: 'degraded',
      service: 'campusverse-api',
      phase: 'phase-2',
      mode: 'unconfigured',
      persistence: 'unconfigured',
      timestamp: new Date().toISOString(),
    });
  });
  app.get(`${API_PREFIX}/auth/config`, (_req, res) => {
    sendSuccess(res, {
      mode: 'supabase',
      persistenceMode: 'postgres',
      demoModeEnabled: false,
      supabaseUrl: env.supabaseUrl || null,
      supabasePublishableKey: env.supabasePublishableKey || null,
      institutionalEmailDomains: env.institutionalEmailDomains,
    });
  });
  app.use(API_PREFIX, (_req, res) => {
    sendError(
      res,
      503,
      'DATABASE_NOT_CONFIGURED',
      'PostgreSQL database connection is required. Demo sandbox fallback is disabled.',
    );
  });
  return app;
}

async function resolveAdapterAndValidateStartup(): Promise<DataAdapter | null> {
  if (env.isProduction) {
    if (!env.databaseUrl) {
      throw new Error(
        'FATAL: DATABASE_URL is required in production. Refusing to start without restricted PostgreSQL runtime credentials.',
      );
    }
    if (!env.supabaseUrl) {
      throw new Error(
        'FATAL: SUPABASE_URL is required in production for authentication verification.',
      );
    }
  }

  if (env.isDatabaseConfigured) {
    return new PostgresDataAdapter();
  }

  if (env.enableDemoMode) {
    console.warn('CampusVerse starting in isolated development DemoDataAdapter sandbox.');
    return demoDataAdapter;
  }

  return null;
}

async function startServer() {
  const adapter = await resolveAdapterAndValidateStartup();
  const app = adapter ? createApp(adapter) : createUnconfiguredApp();
  const httpServer = http.createServer(app);

  if (!env.isProduction) {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : {server: httpServer},
        ws: hmrDisabled ? false : {server: httpServer},
      },
      appType: 'spa',
    });
    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.type('application/javascript; charset=utf-8').send(NO_HMR_CLIENT_MODULE);
      });
    }
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'manifest.webmanifest' ||
            base.startsWith('workbox-')
          ) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.sendFile(indexFile);
      } else {
        res.status(503).send('Production build not found. Run npm run build.');
      }
    });
  }

  const shutdown = async () => {
    await closeDbPool();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(
      `CampusVerse server running on http://0.0.0.0:${env.port} (${env.nodeEnv}, adapter=${adapter ? adapter.getPersistenceMode() : 'unconfigured'})`,
    );
    if (adapter && adapter.getPersistenceMode() === 'postgres') {
      adapter
        .checkReadiness()
        .then((health) => {
          if (!health.ready) {
            console.error('PostgreSQL readiness check failed:', health.error);
            if (health.error?.includes('28P01') && health.error.includes('campusverse_app')) {
              console.error(
                'Action required: Ensure the literal unencoded password in Supabase (`ALTER ROLE campusverse_app WITH LOGIN PASSWORD ...`) matches the URL-decoded password in your DATABASE_URL Secret.',
              );
            }
          } else {
            console.log(`PostgreSQL connected cleanly (${health.latencyMs}ms).`);
          }
        })
        .catch((err) => {
          console.error('PostgreSQL readiness probe error:', err instanceof Error ? err.message : err);
        });
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start CampusVerse server:', err);
  process.exit(1);
});
