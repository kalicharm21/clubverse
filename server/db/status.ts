import dotenv from 'dotenv';
import {sql} from 'drizzle-orm';
import {createDbPool} from './index.ts';

dotenv.config();

const TABLES = [
  'users',
  'clubs',
  'club_memberships',
  'club_invitations',
  'club_follows',
  'events',
  'event_forms',
  'form_fields',
  'event_form_versions',
  'registrations',
  'tickets',
  'attendance_records',
  'event_reports',
  'finance_reports',
  'finance_line_items',
  'finance_entries',
  'notifications',
  'audit_logs',
  'system_settings',
  'hall_of_fame_snapshots',
  'auth_sessions',
] as const;

async function checkStatus() {
  const url =
    process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
  if (!url) {
    console.error('DATABASE_MIGRATION_URL or DATABASE_URL is required to inspect database status.');
    process.exit(1);
  }

  const {client, db} = createDbPool(url, 2);
  try {
    const versionRows = await db.execute(sql`SELECT version() AS version`);
    console.log('PostgreSQL:', (versionRows[0] as {version?: string})?.version || 'connected');

    try {
      const migrations = await db.execute(
        sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC`,
      );
      console.log(`Applied Drizzle migrations: ${migrations.length}`);
    } catch {
      console.log('Applied Drizzle migrations: 0 (drizzle.__drizzle_migrations not created yet)');
    }

    const rlsRows = (await db.execute(sql`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)) as Array<{tablename: string; rowsecurity: boolean}>;

    const rlsMap = new Map(rlsRows.map((r) => [r.tablename, r.rowsecurity]));

    const roles = (await db.execute(sql`
      SELECT rolname, rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = 'campusverse_app'
    `)) as Array<{rolname: string; rolsuper: boolean; rolbypassrls: boolean}>;

    if (roles.length > 0) {
      const r = roles[0];
      console.log(
        `Runtime role campusverse_app: present (rolsuper=${r.rolsuper}, rolbypassrls=${r.rolbypassrls})`,
      );
    } else {
      console.log('Runtime role campusverse_app: NOT FOUND (run npm run db:rls)');
    }

    console.log('\nTable inventory & RLS status:');
    for (const tableName of TABLES) {
      const existsRow = rlsMap.has(tableName);
      if (!existsRow) {
        console.log(`  - ${tableName}: MISSING`);
        continue;
      }
      const countRes = await client.unsafe<{count: string}[]>(
        `SELECT COUNT(*)::text AS count FROM public."${tableName}"`,
      );
      const count = countRes[0]?.count ?? '0';
      const rlsEnabled = rlsMap.get(tableName) ?? false;
      console.log(`  - ${tableName}: ${count} rows | RLS=${rlsEnabled ? 'ON' : 'OFF'}`);
    }
  } finally {
    await client.end({timeout: 5});
  }
}

checkStatus().catch((err) => {
  console.error('Database status check failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
