import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import postgres from 'postgres';
import {isLocalDatabaseHost, normalizePostgresUrl} from './connectionUrl.ts';

dotenv.config();

async function applyRlsAndRole() {
  const migrationUrl = process.env.DATABASE_MIGRATION_URL?.trim();
  if (!migrationUrl) {
    throw new Error('DATABASE_MIGRATION_URL must be set to apply RLS policies and runtime role grants.');
  }

  const normalized = normalizePostgresUrl(migrationUrl);
  const sql = postgres(normalized, {
    prepare: false,
    max: 1,
    ssl: isLocalDatabaseHost(normalized) ? false : 'require',
  });

  try {
    const rlsPath = path.resolve(process.cwd(), 'server/db/rls.sql');
    const rlsSql = fs.readFileSync(rlsPath, 'utf8');

    await sql.unsafe(rlsSql);
    console.log('Applied RLS policies and integrity triggers successfully.');

    // Create or verify least-privilege runtime role campusverse_app
    const existingRole = await sql`SELECT 1 FROM pg_roles WHERE rolname = 'campusverse_app'`;
    let extractedDbUrlPassword = '';
    if (process.env.DATABASE_URL?.trim()) {
      try {
        const parsedRuntimeUrl = new URL(normalizePostgresUrl(process.env.DATABASE_URL.trim()));
        if (parsedRuntimeUrl.password) {
          extractedDbUrlPassword = decodeURIComponent(parsedRuntimeUrl.password);
        }
      } catch {
        // Ignore malformed DATABASE_URL during migration script
      }
    }
    const providedAppPassword =
      process.env.CAMPUSVERSE_APP_DB_PASSWORD?.trim() || extractedDbUrlPassword;
    const rolePassword = providedAppPassword || crypto.randomBytes(24).toString('base64url');
    const escapedPasswordLiteral = `'${rolePassword.replace(/'/g, "''")}'`;

    if (existingRole.length === 0) {
      await sql.unsafe(
        `CREATE ROLE campusverse_app WITH LOGIN PASSWORD ${escapedPasswordLiteral} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION`,
      );
      console.log('Created restricted runtime role: campusverse_app (NOSUPERUSER, NOBYPASSRLS).');
    } else if (providedAppPassword) {
      await sql.unsafe(`ALTER ROLE campusverse_app WITH LOGIN PASSWORD ${escapedPasswordLiteral}`);
      console.log('Updated password for existing restricted runtime role: campusverse_app.');
    } else {
      console.log('Restricted runtime role campusverse_app already exists (attributes verified).');
    }

    // Apply least-privilege grants
    await sql.unsafe(`
      GRANT USAGE ON SCHEMA public TO campusverse_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON
        public.users,
        public.clubs,
        public.club_memberships,
        public.club_invitations,
        public.club_follows,
        public.events,
        public.event_forms,
        public.form_fields,
        public.registrations,
        public.tickets,
        public.attendance_records,
        public.event_reports,
        public.finance_reports,
        public.finance_line_items,
        public.finance_entries,
        public.notifications,
        public.system_settings,
        public.hall_of_fame_snapshots,
        public.auth_sessions
      TO campusverse_app;
      GRANT SELECT, INSERT ON public.audit_logs, public.event_form_versions TO campusverse_app;
      REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs, public.event_form_versions FROM campusverse_app, PUBLIC;
    `);
    await sql.unsafe(`
      DO $$
      BEGIN
        EXECUTE format('GRANT campusverse_app TO %I WITH INHERIT FALSE, SET TRUE', current_user);
      END $$;
    `);
    console.log('Applied least-privilege table grants (audit_logs restricted to SELECT, INSERT only).');
  } finally {
    await sql.end({timeout: 5});
  }
}

applyRlsAndRole().catch((err) => {
  console.error('Failed to apply RLS/role configuration:', err instanceof Error ? err.message : err);
  process.exit(1);
});
