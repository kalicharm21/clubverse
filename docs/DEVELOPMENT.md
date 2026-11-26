# Development Guide

## Environment Setup

Configure environment variables in **AI Studio Secrets** (or local `.env` — never commit real secrets to Git):

- `SUPABASE_URL` & `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key (client Auth only).
- `DATABASE_MIGRATION_URL`: Privileged Postgres Session Pooler URL (`postgres.<ref>`, port `5432`) used **only** by migration/RLS/seed scripts.
- `DATABASE_URL`: Restricted runtime Postgres URL using the `campusverse_app` role (`NOSUPERUSER`, `NOBYPASSRLS`).
- `TICKET_ENCRYPTION_KEY`: 32-byte key used to AES-256-GCM seal released QR ticket tokens.
- `INSTITUTIONAL_EMAIL_DOMAINS`: Comma-separated allowed campus domains (e.g., `vitbhopal.ac.in`).
- `SUPER_ADMIN_BOOTSTRAP_EMAILS`: Comma-separated emails eligible for initial Super Admin bootstrap.
- `SUPABASE_SERVICE_ROLE_KEY` (CLI-only): Optional service-role key used strictly by `npm run db:seed:test` / `npm run db:reset:test` to provision local/staging Supabase Auth test accounts.
- `SMTP_URL` / `SMTP_FROM` (Optional): Transactional SMTP relay configuration for invitations and ticket notifications.
- `ENABLE_DEMO_MODE="false"` & `VITE_ENABLE_DEMO_MODE="false"`: Keeps production/PostgreSQL mode active without accidental demo fallback.

## Database Lifecycle Commands

```bash
npm run db:generate    # Generate Drizzle SQL migrations into drizzle/
npm run db:migrate     # Apply SQL migrations to Supabase PostgreSQL
npm run db:rls         # Apply triggers, RLS policies, and campusverse_app grants
npm run db:seed        # Seed idempotent clubs, published events, forms, and settings
npm run db:seed:test   # Provision non-production Phase 5 test dataset & Auth users (non-prod only)
npm run db:reset:test  # Remove ONLY non-production test data & Auth test users
npm run db:status      # Verify migration state, row counts, RLS flags, and runtime role
```

## Running & Testing

```bash
npm run dev            # Starts Express + Vite middleware on http://localhost:3000
npm run lint           # TypeScript typechecking (tsc --noEmit)
npm run build          # Production Vite + Workbox PWA bundle
npm test               # Runs API, frontend RTL, and live PostgreSQL RLS integration tests
npm run test:e2e       # Runs Playwright browser E2E tests
```
