# Architectural Decision Records (ADRs)

1. **ADR-001 — Modular Monolith over Microservices**: Keeps 13 cohesive modules in one TypeScript codebase with clean `DataAdapter` boundaries for straightforward Drizzle repository swaps.
2. **ADR-002 — In-Memory Session Tokens over `localStorage`**: Prevents XSS token harvesting in sandbox mode while Supabase Auth SDK manages official OAuth/JWT session refresh in production.
3. **ADR-003 — Opaque Non-PII QR Credentials**: Protects student privacy at event gates and decouples ticket validation from personal data.
4. **ADR-004 — Standard Competition Ranking (`1, 2, 2, 4`) in Hall of Fame**: Ensures deterministic, fair tie handling when multiple clubs share identical follower counts.
5. **ADR-009 — Express Authoritative API Boundary over Direct Browser Data API**: Keeps business invariants (2-club cap, capacity waitlists, QR single-use check-in, audit logging) inside Express + PostgreSQL transactions rather than exposing table mutations via Supabase PostgREST.
6. **ADR-010 — Database Privilege Separation (`campusverse_app`) + Transaction-Local RLS**: Separates privileged DDL/migrations (`DATABASE_MIGRATION_URL`) from runtime queries (`DATABASE_URL` with `NOSUPERUSER`, `NOBYPASSRLS`) and passes verified identity via `set_config(..., ..., true)` so pooled Supavisor connections never leak session context.
7. **ADR-011 — Pessimistic Row Locking (`FOR UPDATE`) for Concurrency Invariants**: Serializes concurrent club-follow, seat-capacity registration, and QR check-in requests at the PostgreSQL row level, eliminating TOCTOU race conditions.
8. **ADR-012 — `SECURITY DEFINER` Counter Triggers for `follower_count` and `registered_count`**: Allows students to follow/register under strict RLS without granting them direct `UPDATE` rights on `clubs` or `events`.
9. **ADR-013 — Integer-Cent Fixed-Point Financial Arithmetic**: Converts line-item amounts into integer cents (`NUMERIC(12,2)` in Postgres) before summing collections, expenses, and net balance to prevent floating-point drift.
10. **ADR-014 — Asymmetric ES256 JWKS Verification + URL Credential Encoding**: Verifies Supabase asymmetric JWTs via cached `/auth/v1/.well-known/jwks.json` using Node's `crypto.verify` (`ieee-p1363` encoding) and normalizes Postgres URLs containing special characters in passwords.
