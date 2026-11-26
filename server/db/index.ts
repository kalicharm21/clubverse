import {AsyncLocalStorage} from 'node:async_hooks';
import {sql} from 'drizzle-orm';
import {drizzle, type PostgresJsDatabase} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {env} from '../config/env.ts';
import {isLocalDatabaseHost, normalizePostgresUrl} from './connectionUrl.ts';
import {dbRequestContext, type DbRequestContext} from './requestContext.ts';
import * as schema from './schema.ts';

export type AppDatabase = PostgresJsDatabase<typeof schema>;

const SLOW_QUERY_THRESHOLD_MS = 250;

let runtimeClient: postgres.Sql | null = null;
let runtimeDb: AppDatabase | null = null;

export function createDbPool(connectionString: string, maxConnections = 10): {
  client: postgres.Sql;
  db: AppDatabase;
} {
  const normalized = normalizePostgresUrl(connectionString);
  const sslMode = isLocalDatabaseHost(normalized) ? false : 'require';
  const client = postgres(normalized, {
    prepare: false,
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: sslMode,
  });
  const db = drizzle(client, {schema});
  return {client, db};
}

export function getDb(): AppDatabase {
  if (!runtimeDb) {
    if (!env.effectiveRuntimeDbUrl) {
      throw new Error(
        'PostgreSQL database URL is not configured. Set DATABASE_URL (or DATABASE_MIGRATION_URL in development).',
      );
    }
    const pool = createDbPool(env.effectiveRuntimeDbUrl);
    runtimeClient = pool.client;
    runtimeDb = pool.db;
  }
  return runtimeDb;
}

export function getSqlClient(): postgres.Sql {
  if (!runtimeClient) {
    getDb();
  }
  return runtimeClient!;
}

export async function closeDbPool(): Promise<void> {
  if (runtimeClient) {
    await runtimeClient.end({timeout: 5});
    runtimeClient = null;
    runtimeDb = null;
  }
}

export type DbTx = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

const activeTxStorage = new AsyncLocalStorage<DbTx>();

/**
 * Executes a callback inside a PostgreSQL transaction with strictly transaction-local
 * RLS identity context (`set_config(..., ..., true)`), avoiding session identity leakage across pooled connections.
 */
export async function withRlsTransaction<T>(
  operationName: string,
  fn: (tx: DbTx) => Promise<T>,
  overrideContext?: Partial<DbRequestContext>,
): Promise<T> {
  const db = getDb();
  const baseCtx = dbRequestContext.get();
  const ctx: DbRequestContext = {
    userId: overrideContext?.userId ?? baseCtx.userId ?? '',
    globalRole: overrideContext?.globalRole ?? baseCtx.globalRole ?? 'public',
    requestId: overrideContext?.requestId ?? baseCtx.requestId,
  };

  const startedAt = performance.now();
  try {
    const existingTx = activeTxStorage.getStore();
    if (existingTx) {
      if (overrideContext) {
        await existingTx.execute(
          sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true), set_config('app.current_global_role', ${ctx.globalRole}, true)`,
        );
      }
      return await dbRequestContext.run(ctx, () => fn(existingTx));
    }

    return await db.transaction(async (tx) => {
      if (!env.databaseUrl && env.databaseMigrationUrl) {
        await tx.execute(sql`SET LOCAL ROLE campusverse_app`);
      }
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true), set_config('app.current_global_role', ${ctx.globalRole}, true)`,
      );
      return activeTxStorage.run(tx, () => dbRequestContext.run(ctx, () => fn(tx)));
    });
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'slow_db_transaction',
          operation: operationName,
          durationMs,
          requestId: ctx.requestId || null,
        }),
      );
    }
  }
}

export async function checkDatabaseHealth(): Promise<{ready: boolean; latencyMs: number; error?: string}> {
  const startedAt = performance.now();
  try {
    const client = getSqlClient();
    await client`SELECT 1 AS ok`;
    return {
      ready: true,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    const errObj = error as {message?: string; code?: string; cause?: {message?: string; code?: string}};
    const rootMessage = errObj?.cause?.message || errObj?.message || 'Database connectivity check failed';
    const rootCode = errObj?.cause?.code || errObj?.code;
    const sanitized = rootCode ? `[${rootCode}] ${rootMessage}` : rootMessage;
    return {
      ready: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: sanitized,
    };
  }
}
