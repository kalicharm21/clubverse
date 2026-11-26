import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const runtimeFallbackSecret = crypto.randomBytes(32).toString('hex');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const databaseUrl = process.env.DATABASE_URL?.trim() || '';
const databaseMigrationUrl = process.env.DATABASE_MIGRATION_URL?.trim() || '';

// In production, ONLY the restricted DATABASE_URL runtime role is allowed.
// In development, allow falling back to DATABASE_MIGRATION_URL until DATABASE_URL is configured.
const effectiveRuntimeDbUrl = isProduction ? databaseUrl : databaseUrl || databaseMigrationUrl;

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const supabasePublishableKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim();

const institutionalEmailDomains = (process.env.INSTITUTIONAL_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const superAdminBootstrapEmails = (process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  isProduction,
  databaseUrl,
  databaseMigrationUrl,
  effectiveRuntimeDbUrl,
  isDatabaseConfigured: Boolean(effectiveRuntimeDbUrl),
  supabaseUrl,
  supabasePublishableKey,
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  supabaseJwtSecret: (process.env.SUPABASE_JWT_SECRET || '').trim(),
  smtpUrl: (process.env.SMTP_URL || '').trim(),
  smtpFrom: (process.env.SMTP_FROM || 'no-reply@campusverse.edu').trim(),
  invitationTtlHours: Math.max(1, Number(process.env.INVITATION_TTL_HOURS || 72) || 72),
  maxCsvExportRows: Math.max(100, Number(process.env.MAX_CSV_EXPORT_ROWS || 5000) || 5000),
  institutionalEmailDomains,
  superAdminBootstrapEmails,
  // Demo mode is strictly isolated: never active in production and never active when a PostgreSQL DB URL is configured
  enableDemoMode:
    !isProduction &&
    process.env.ENABLE_DEMO_MODE === 'true' &&
    !databaseUrl &&
    !databaseMigrationUrl,
  sessionSecret: process.env.SESSION_SECRET || runtimeFallbackSecret,
  ticketEncryptionKey:
    process.env.TICKET_ENCRYPTION_KEY?.trim() ||
    crypto
      .createHash('sha256')
      .update(`campusverse-ticket-seal:${effectiveRuntimeDbUrl || supabaseUrl || 'dev-local'}`)
      .digest('hex'),
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

