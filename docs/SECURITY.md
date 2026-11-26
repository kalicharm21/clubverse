# Security Architecture & Credential Governance

## 1. Security Controls

- **Authoritative Express API Boundary**: React never calls `supabase.from(...)`. `@supabase/supabase-js` is used solely for Supabase Auth; all business reads and writes route through Express (`/api/v1/*`) with `Authorization: Bearer <access_token>`.
- **JWT Verification (`ES256`/`RS256` JWKS)**: `server/shared/auth/supabaseAuth.ts` verifies Supabase tokens against cached JWKS (`/auth/v1/.well-known/jwks.json` with automatic rotation refresh), validates issuer, expiration, `emailVerified === true`, and `INSTITUTIONAL_EMAIL_DOMAINS`.
- **Server-Side RBAC & Context Isolation**: Multi-role dashboard switching in the UI only selects which authorized view to render; every API route resolves active memberships from PostgreSQL and validates club-scoped permissions (`requireClubAdmin`, `requireClubPermission`, `requireEventPermission`, `requireSuperAdmin`).
- **Database Privilege Separation & RLS**: `campusverse_app` (`rolsuper = false`, `rolbypassrls = false`) enforces Row-Level Security across all 21 tables. Sensitive tables (`tickets`, `finance_entries`, `finance_reports`, `registrations`, `users`) isolate rows per owner or authorized club officer.
- **QR Ticket Token Security**:
  - Tickets use cryptographically random `CV-TCK-...` tokens with zero embedded PII.
  - Database tables store only SHA-256 `token_hash` (for gate verification) and AES-256-GCM `sealed_token` (unsealed strictly for owning student's `GET /api/v1/tickets/me` or `GET /api/v1/registrations/me` when `ticketStatus === 'released'`).
  - Pre-release, revoked, waitlisted, cancelled, wrong-event, and duplicate scans are blocked server-side and logged.
- **XSS & Formula Injection Protection**:
  - External URLs (club `instagramUrl`, report `evidenceUrl`, finance `receiptUrl`) are validated server-side via Zod (`http:`/`https:` only; Instagram restricted to `instagram.com`) and rendered exclusively via `<SafeExternalLink>` with `rel="noopener noreferrer"`.
  - All CSV exports (`registrations`, `attendance`, `admin/reports`, `admin/finance`) neutralize cells beginning with `=`, `+`, `-`, `@`, `\t`, or `\r`.
- **Audit Logging & Safe Error Handling**: Privileged operations append to `audit_logs` (`SELECT, INSERT` only for runtime role). Logs redact tokens, passwords, and personal registration answers.
- **No Accidental Demo Fallback**: `DemoDataAdapter` and `/api/v1/auth/demo-*` are disabled whenever PostgreSQL is configured or `NODE_ENV === 'production'`.

---

## 2. Credential & Environment Variable Governance

Never commit real passwords, private keys, or database URLs into Git, `.env.example`, or documentation.

| Variable | Obtain From | Configure In | Scope | Secret? | Rotation Procedure |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → Data API / General | Hosting env / AI Studio Secrets | Backend | No | Project-tied; update across env vars if migrating project |
| `VITE_SUPABASE_URL` | Same Supabase project URL | Vite build / hosting env | Frontend (public) | No | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → API Keys → Publishable key | Vite build / hosting env | Frontend (public, RLS-gated) | No | Rotate/revoke in Supabase API Keys and redeploy frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → API Keys → `service_role` (or Secret key) | Local/CI CLI env ONLY (`seedTestAccounts.ts`) | Backend CLI only (NEVER browser) | **YES (Critical)** | Rotate immediately in Supabase API Keys; never expose to frontend or browser bundles |
| `DATABASE_URL` | Supabase Session/Transaction Pooler URL using restricted `campusverse_app` credentials | Backend server runtime env / Secrets | Backend ONLY | **YES** | `ALTER ROLE campusverse_app WITH PASSWORD '<new>';` then update `DATABASE_URL` & restart server |
| `DATABASE_MIGRATION_URL` | Supabase Session Pooler (`:5432`) using migration role (`postgres.<ref>`) | Migration/CLI env ONLY | Migration CLI ONLY | **YES** | Reset DB password in Supabase Database Settings, update secret, avoid setting in production app runtime if unnecessary |
| `TICKET_ENCRYPTION_KEY` | Generate locally via `openssl rand -base64 32` | Backend server runtime env / Secrets | Backend ONLY | **YES** | Use stable 32-byte key in production; if rotated, schedule ticket re-sealing migration |
| `SMTP_URL` / `SMTP_FROM` | Institutional SMTP relay or transactional mail provider | Backend server runtime env / Secrets | Backend ONLY | **YES (`SMTP_URL`)** | Rotate SMTP app password/API key at provider and update `SMTP_URL` |
| `INSTITUTIONAL_EMAIL_DOMAINS` | University IT / Student Affairs domain policy | Backend runtime env | Backend | No | Update comma-separated domains and restart API |
| `SUPER_ADMIN_BOOTSTRAP_EMAILS` | Institutional admin roster | Backend runtime env | Backend | No | Remove bootstrap email after initial Super Admin account is provisioned |
| `GEMINI_API_KEY` | Google AI Studio (optional if AI features enabled) | Backend runtime env ONLY | Backend | **YES** | Revoke and regenerate key in Google AI Studio |
