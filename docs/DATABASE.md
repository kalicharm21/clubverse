# Database Architecture (PostgreSQL + Drizzle ORM + RLS)

CampusVerse uses **21 normalized PostgreSQL tables** defined in `server/db/schema.ts` with UUID primary keys, explicit foreign keys (`ON DELETE CASCADE` / `SET NULL`), check constraints, partial/composite unique indexes, and B-Tree query indexes.

---

## 1. Applied Migrations (`drizzle/`)

| Migration | Purpose |
| :--- | :--- |
| `0000_fancy_korvac.sql` | Initial core tables (`users`, `clubs`, `club_memberships`, `club_follows`, `events`, `event_forms`, `form_fields`, `registrations`, `attendance_records`, `event_reports`, `finance_reports`, `finance_line_items`, `notifications`, `audit_logs`, `system_settings`, `hall_of_fame_snapshots`, `auth_sessions`) |
| `0001_windy_bedlam.sql` | Baseline schema refinements and constraint indexes |
| `0002_phase4_leadership_events_perf.sql` | `club_invitations`, `event_form_versions`, `vice_president` role & unique active President/VP constraints, 6-state event lifecycle, `eligibility_rules`, `fee_minor_units`, performance indexes |
| `0003_phase5_completion.sql` | `clubs.instagram_url`, `events.tickets_released_at` & `tickets_released_by`, `tickets` table, structured `event_reports` fields & `history` JSONB, `finance_entries` integer-paise ledger, minor-unit columns on `finance_reports` |

---

## 2. 21-Table Schema Inventory

1. `users` — Institutional user accounts linked 1:1 to Supabase Auth (`auth_user_id`), normalized email, global role (`user` | `super_admin`), account status (`active` | `suspended` | `disabled`).
2. `clubs` — Student organizations (`slug`, `category`, `status`, `instagram_url`, trigger-maintained `follower_count`).
3. `club_memberships` — Scoped club roles (`president` | `vice_president` | `core_member`), JSONB `permissions`, partial unique indexes enforcing at most 1 active President and 1 active Vice President per club.
4. `club_invitations` — Tokenized club invitations storing SHA-256 `token_hash` only, expiry, and single-use acceptance tracking.
5. `club_follows` — Student follow edges (`UNIQUE(user_id, club_id)`), capped at 2 active-club follows under `FOR UPDATE` row lock on `users`.
6. `events` — Club-hosted events with 6-state lifecycle (`draft` | `published` | `registration_open` | `registration_closed` | `completed` | `cancelled`), `capacity > 0`, `fee_minor_units`, `tickets_released_at`, trigger-maintained `registered_count`.
7. `event_forms` — Draft form container per event (`UNIQUE(event_id)`), tracking `version`, `published_version`, and `status` (`draft` | `published`).
8. `form_fields` — Ordered fields supporting 10 field types (`text`, `textarea`, `email`, `phone`, `number`, `select`, `radio`, `checkboxes`, `checkbox`, `url`) plus `validation_rules` JSONB (including regex `pattern` & `patternMessage`).
9. `event_form_versions` — Immutable published form snapshots (`UNIQUE(event_id, version)`) preserving exact schema used at student registration time.
10. `registrations` — Student event registrations (`UNIQUE(event_id, user_id)`), `form_version_id` FK, `status` (`pending` | `confirmed` | `waitlisted` | `cancelled` | `attended`), and SHA-256 `qr_token_hash`.
11. `tickets` — Controlled ticket records (`UNIQUE(registration_id)`), `status` (`not_released` | `released` | `revoked`), unique `ticket_code`, SHA-256 `token_hash`, AES-256-GCM `sealed_token`, `released_by`/`released_at`, `revoked_by`/`revoked_at`.
12. `attendance_records` — Single-entry check-in ledger (`UNIQUE(registration_id)`) guaranteeing zero duplicate check-ins even under concurrent scans.
13. `event_reports` — Post-event reports (`UNIQUE(event_id)`) with `objectives`, `actual_event_date`, `participation_summary`, `outcomes`, `highlights`, `challenges`, `feedback_observations`, `evidence_url`, review `status` (`draft` | `submitted` | `under_review` | `changes_requested` | `approved` | `rejected`), `review_notes`, and `history` JSONB audit trail.
14. `finance_reports` — Event-level financial reconciliations storing both `numeric(12,2)` and integer minor-unit `bigint` columns (`total_collections_minor_units`, `total_expenses_minor_units`, `net_balance_minor_units`).
15. `finance_line_items` — Itemized reconciliation lines linked to `finance_reports`.
16. `finance_entries` — Club & optional event-linked financial ledger storing `entry_type` (`income` | `expense`), `amount_minor_units` (`bigint >= 0`, paise), `transaction_date`, `vendor_recipient`, `receipt_url`, and creator metadata.
17. `notifications` — User inbox indexed on `(user_id, is_read, created_at)`.
18. `audit_logs` — Append-only governance & operational trail (`SELECT, INSERT` only for `campusverse_app`).
19. `system_settings` — Institutional runtime configuration (`campusverse_config`).
20. `hall_of_fame_snapshots` — Historical leaderboard ranking snapshots.
21. `auth_sessions` — Non-sensitive session audit metadata.

---

## 3. Privilege Separation, RLS & Integrity Triggers

- **Migration Owner (`DATABASE_MIGRATION_URL`)**: Used exclusively by `drizzle-kit`, `applyRls.ts`, `seed.ts`, `seedTestAccounts.ts`, and `status.ts`.
- **Restricted Runtime Role (`campusverse_app` via `DATABASE_URL`)**: Configured with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOBYPASSRLS`, `NOREPLICATION`.
- **Transaction-Local RLS Identity**: Every `withRlsTransaction` sets parameterized `set_config('app.current_user_id', ..., true)` and `set_config('app.current_global_role', ..., true)` so pooled Supavisor connections (`prepare: false`) remain isolated.
- **Database Triggers**:
  - `prevent_user_privilege_escalation`: Blocks non-admin updates to `users.global_role` and `users.account_status`.
  - `prevent_club_privilege_escalation`: Blocks non-admin edits to `clubs.status` and `clubs.follower_count`.
  - `prevent_club_admin_membership_escalation`: Restricts `president`/`vice_president` mutations to `super_admin` / trusted invitation activation.
  - `enforce_four_core_scanner_limit`: Uses `pg_advisory_xact_lock` to cap active Core Members with `SCAN_ATTENDANCE` at 4 per club (President and VP exempt).
  - `sync_club_follower_count` & `sync_event_registered_count`: Maintain accurate counters transactionally.
  - `promote_next_waitlisted_registration`: Atomically promotes the earliest waitlisted registration (`FOR UPDATE SKIP LOCKED`) when a confirmed student cancels.

---

## 4. Backup & Recovery Guidance

1. **Automated Backups**: Enable Supabase Point-in-Time Recovery (PITR) / daily snapshots in the Supabase Dashboard for production projects.
2. **Pre-Migration Logical Dump**: Before running `npm run db:migrate` in staging/production, take a schema + data backup using `pg_dump` against the direct/session pooler URL (`DATABASE_MIGRATION_URL`):
   ```bash
   pg_dump --format=custom --no-owner --no-privileges "$DATABASE_MIGRATION_URL" -f "backup-$(date +%Y%m%d-%H%M%S).dump"
   ```
3. **Recovery & Re-Verification**: Restore using `pg_restore --no-owner --no-privileges`, then execute `npm run db:rls` and `npm run db:status` to confirm all 21 RLS tables and `campusverse_app` grants remain intact.
4. **Resetting Non-Production Test Data Only**: Never truncate production tables; run `npm run db:reset:test` to cleanly delete only deterministic test fixtures.
