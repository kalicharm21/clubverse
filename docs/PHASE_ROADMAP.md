# Phase Roadmap

- **Phase 1 (Complete)**: React 19 frontend, role workspaces, modular Express API (`/api/v1`), Zod validation, PWA shell, and stateful `DemoDataAdapter`.
- **Phase 2 (Complete)**: Supabase PostgreSQL provisioning, Drizzle ORM migrations, `PostgresDataAdapter`, Supabase Auth JWT (`ES256`/`RS256` JWKS) verification, and Row-Level Security (`campusverse_app`).
- **Phase 3 (Complete)**: Database-backed User Profiles, Club Management (`active`/`inactive`/`suspended`), leadership assignment & scoped Core Member permissions, concurrent 2-club following, and live Hall of Fame rankings (`1, 2, 2, 4`).
- **Phase 4 (Complete)**: 6-state event lifecycle, immutable `event_form_versions`, FIFO waitlist promotion, tokenized SHA-256 invitations, 4-core-scanner quota, performance optimization (server pagination, composite indexes, `SELECT`-only columns, lazy route bundles).
- **Phase 5 (Complete)**: Club Instagram profile integration, draft-vs-published form enforcement (`FORM_NOT_PUBLISHED`), controlled batch ticket release & revocation, real `html5-qrcode` camera scanner + 6 live attendance metrics, persistent top-header multi-role switcher, Student Dashboard Active Events feed, structured post-event report review lifecycle, integer-paise club & event finance ledgers, Super Admin analytics & CSV exports, and safe non-production test provisioning (`db:seed:test`).
