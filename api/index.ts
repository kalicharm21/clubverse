import type {IncomingMessage, ServerResponse} from 'node:http';
import {PostgresDataAdapter} from '../server/adapters/PostgresDataAdapter.ts';
import {createApp} from '../server/app.ts';
import {env} from '../server/config/env.ts';

let cachedApp: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!cachedApp) {
    if (!env.databaseUrl || !env.supabaseUrl) {
      throw new Error('Missing DATABASE_URL or SUPABASE_URL in Vercel Environment Variables');
    }
    cachedApp = createApp(new PostgresDataAdapter());
  }
  return cachedApp;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const app = getApp();
  return app(req as any, res as any);
}