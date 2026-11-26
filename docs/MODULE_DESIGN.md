# Backend Module Design

The 13 modules under `server/modules/`:

1. `auth`: Development session issuance (`signSessionToken`), `/auth/me`, logout, future Supabase Auth boundary.
2. `users`: Profile retrieval & updates, institutional fields.
3. `clubs`: Discovery catalog, sorting, charter creation, profile editing.
4. `memberships`: Club Admin & Core Member assignments, granular permission updates, student 2-club follow limit.
5. `hall-of-fame`: Deterministic competition ranking (`1, 2, 2, 4`) across active clubs.
6. `events`: Draft creation, updates, publishing workflow.
7. `forms`: Versioned custom form schemas per event.
8. `registrations`: Dynamic required-field validation, capacity/waitlist handling, non-PII QR generation.
9. `attendance`: Single-use QR verification, duplicate scan conflict (`409`), manual override fallback.
10. `reports`: Event outcome summaries and completion state transitions.
11. `finance`: Collection/expense line-item totals and audit logging.
12. `notifications`: Per-user notification feed and read-state mutations.
13. `admin`: Institution KPIs, club/user status governance, consolidated finance, audit trail, system settings.
