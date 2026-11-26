import dotenv from 'dotenv';
import {defineConfig} from 'drizzle-kit';
import {normalizePostgresUrl} from './server/db/connectionUrl.ts';

dotenv.config();

const migrationUrl = normalizePostgresUrl(
  process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || '',
);

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: migrationUrl,
  },
  strict: true,
  verbose: true,
});
