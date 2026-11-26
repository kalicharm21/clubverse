# CampusVerse Operations Runbook

## 1. Authentication & Multi-Role Workspace Switching
1. Users authenticate via Supabase Auth on `/login` using an institutional email matching `INSTITUTIONAL_EMAIL_DOMAINS`.
2. Express verifies the Bearer JWT (`ES256`/`RS256` JWKS) and loads the user's single persistent `public.users` record plus all active `club_memberships`.
3. Every user—even if President, Vice President, or Core Member of multiple clubs—retains their Student identity and `Student Dashboard` context.
4. Use the persistent top-header workspace switcher (`#header-workspace-select`) or sidebar switcher to move cleanly between **Student Dashboard**, club leadership dashboards, and **Super Admin** oversight without re-authenticating or creating duplicate accounts.

---

## 2. Club Setup, Leadership, Core Invitations & Instagram Profile
1. **Create Club & Assign Leadership**: Super Admin opens **Admin → Clubs**, creates the club (with optional validated `instagramUrl`), and assigns **President** / **Vice President** via `/api/v1/admin/clubs/:clubId/leadership`.
2. **Core Member Invitations & 4-Scanner Quota**: Club President or VP invites Core Members with explicit granular permissions (`MANAGE_EVENTS`, `MANAGE_FORMS`, `VIEW_REGISTRATIONS`, `SCAN_ATTENDANCE`, `SUBMIT_EVENT_REPORTS`, `SUBMIT_FINANCE_REPORTS`). Up to **4 active Core Members** per club may hold `SCAN_ATTENDANCE` (President and VP do not consume this quota).
3. **Instagram Profile Configuration**: President, VP, or Super Admin edits the club profile (**Club Profile** or **Admin → Clubs**) and enters either `@handle` or `https://www.instagram.com/<handle>/`. Backend Zod validation normalizes valid Instagram URLs and rejects invalid domains or unsafe schemes (`javascript:`, `data:`). Public pages render `<SafeExternalLink>` with `rel="noopener noreferrer"`.

---

## 3. Events, Custom Forms & Publishing
1. **Event Lifecycle**: `draft` → `published` → `registration_open` → `registration_closed` → `completed` (or `cancelled`). Backend rejects publishing events for inactive clubs.
2. **Form Builder**: Supports 10 field types (`text`, `textarea`, `email`, `phone`, `number`, `select`, `radio`, `checkboxes`, `checkbox`, `url`), descriptions, ordering, and regex `validationRules.pattern` + `patternMessage`.
3. **Publishing & Immutable Snapshots**: Clicking **Save Draft** updates the editable draft (`PUT /api/v1/events/:eventId/form`). Clicking **Publish Form** (`POST /api/v1/events/:eventId/form/publish`) validates all fields and writes an immutable `event_form_versions` snapshot. Public event pages request `?publishedOnly=true` and display a clear `role="alert"` notice (`422 FORM_NOT_PUBLISHED`) until published. Historical registrations always retain the exact form version snapshot submitted.

---

## 4. Registrations & Controlled Batch Ticket Release
1. **Student Registration**: Students discover active events on the **Student Dashboard → Active Events** paginated feed or `/app/student/events`, submit the published form, and receive an immediate confirmation (`registrationStatus = 'confirmed'` or `'waitlisted'` under atomic capacity locking).
2. **Pre-Release Isolation**: Newly confirmed registrations start with `ticketStatus = 'not_released'` and no usable QR token. Students see *"Your registration is confirmed. Your ticket will be available once the club releases tickets."*
3. **Batch Ticket Release**: Authorized organizers (**Club → Registrations & Ticket Management**) click **Release Tickets**, verify the eligible participant count in the confirmation modal, and execute `POST /api/v1/events/:eventId/tickets/release`. This operation is transactional and idempotent, generating `CV-TCK-...` tokens, storing SHA-256 hashes + AES-256-GCM sealed tokens, dispatching in-app notifications, and unlocking QR passes in **My Registrations**.
4. **Revocation**: Individual tickets can be revoked (`POST /api/v1/tickets/:ticketId/revoke`); revoked tickets fail immediately at gate check-in (`422 TICKET_REVOKED`).

---

## 5. Camera QR Scanner Setup & Attendance Verification
1. **Authorization**: Only the club's **President**, **Vice President**, or Core Members with `SCAN_ATTENDANCE` may open the scanner or invoke `/attendance/scan`.
2. **Camera Scanner**: Open **Attendance & QR** and click **Open QR Scanner**. Grant browser camera permission (`navigator.mediaDevices.getUserMedia` requires `https://` in production or `http://localhost` in development). `html5-qrcode` automatically decodes the `CV-TCK-...` pass and calls `POST /api/v1/events/:eventId/attendance/verify`.
3. **Troubleshooting**:
   - *Camera Permission Denied*: Allow camera access in browser site settings, or use the **Manual Token Entry** field with the participant's opaque `CV-TCK-...` code.
   - *Already Scanned (`409`)*: Single-use database `UNIQUE(registration_id)` constraint guarantees zero double check-ins.
   - *Wrong Event / Ticket Not Released / Revoked*: Backend blocks invalid passes with explicit diagnostics without recording attendance.
4. **Live Metrics**: Attendance page tracks 6 real-time database metrics: **Confirmed**, **Tickets Released**, **Not Released**, **Checked In**, **Remaining**, and **Attendance %**.

---

## 6. Post-Event Reporting, Integer-Paise Finance & Super Admin Oversight
1. **Post-Event Reports**: Organizers record structured objectives, event date, participation summary, outcomes, highlights, challenges, feedback/observations, and optional safe `https://` evidence URL in **Reports & Finance**. Reports follow `draft` → `submitted` → `under_review` → `changes_requested` / `approved` / `rejected`, preserving a complete `history` audit trail.
2. **Financial Management**: Authorized officers record club-wide or event-linked income and expenses stored as integer paise (`amount_minor_units`). Students and cross-club members receive `403 Forbidden`.
3. **Super Admin Institutional Dashboard**: Provides live KPIs (`completedEvents`, `totalAttendance`, `pendingReportsCount`, `awaitingApprovalReportsCount`), Club Overview (President/VP, core count, Instagram, followers), Event Analytics, Institutional/Club/Event Finance Overview, report review modal, and formula-safe CSV exports.

---

## 7. Test Accounts & Safe Credential Retrieval
1. **Guardrail**: `npm run db:seed:test` refuses to execute when `NODE_ENV=production`.
2. **Provisioning**: Set `DATABASE_MIGRATION_URL` (and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to create/update Supabase Auth passwords) in your local shell environment and run:
   ```bash
   npm run db:seed:test
   ```
3. **Seeded Non-Production Test Emails**:
   - `superadmin.test@campusverse.test` — Institution-wide Super Admin
   - `student.test@campusverse.test` — Student with no club role
   - `president.cluba.test@campusverse.test` — President of Test Club A (Rover Systems)
   - `vicepresident.cluba.test@campusverse.test` — Vice President of Test Club A
   - `core.scanner.cluba.test@campusverse.test` — Core Member (Club A) with `SCAN_ATTENDANCE`
   - `core.noscanner.cluba.test@campusverse.test` — Core Member (Club A) without `SCAN_ATTENDANCE`
   - `president.clubb.test@campusverse.test` — President of Test Club B (Civic Design)
   - `multirole.test@campusverse.test` — Student + President of Test Club C + Core Member of Test Club B
   - `participant.released.test@campusverse.test` — Registered participant with released QR ticket
   - `participant.pending.test@campusverse.test` — Registered participant whose ticket is `not_released`
4. **Retrieving Generated Passwords**: Generated CSPRNG passwords are written exclusively to the gitignored file `.secrets/test-credentials.json` (`chmod 600`), never stored in PostgreSQL or committed to Git.
5. **Resetting Test Fixtures Only**: Run `npm run db:reset:test` to delete only deterministic test records and test Supabase Auth accounts without affecting real users.

---

## 8. SMTP Configuration & Deployment
- **SMTP**: Configure `SMTP_URL` (`smtp://user:pass@host:587`) and `SMTP_FROM` (`CampusVerse <noreply@yourdomain.edu>`). When `SMTP_URL` is unset, API responses explicitly report `emailDelivery: "not_configured"` and never claim an external email was sent.
- **Deployment Steps**:
  1. Provision Supabase PostgreSQL and Supabase Auth.
  2. Apply migrations (`npm run db:migrate`), RLS & triggers (`npm run db:rls`), and catalog seed (`npm run db:seed`).
  3. Configure all required runtime environment variables (`NODE_ENV=production`, `DATABASE_URL` with `campusverse_app`, `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `TICKET_ENCRYPTION_KEY`, `ENABLE_DEMO_MODE=false`, `VITE_ENABLE_DEMO_MODE=false`).
  4. Build static bundle (`npm run build`) and run Express (`npm run start`).
  5. Verify `GET /api/v1/health` and `GET /api/v1/health/ready` both return HTTP 200.

---

## 9. Common Errors & Troubleshooting
| Error Code / Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| `[28P01] password authentication failed for user "campusverse_app"` | `DATABASE_URL` password out of sync with PostgreSQL role | Run `ALTER ROLE campusverse_app WITH PASSWORD '<secret>';` using migration owner or update `DATABASE_URL` |
| `422 FORM_NOT_PUBLISHED` | Event registration form saved as draft only | Open Club **Form Builder** and click **Publish Form** |
| `422 TICKET_NOT_RELEASED` | Participant registered, organizer has not released tickets yet | Open **Registrations & Ticket Management** → **Release Tickets** |
| `422 SCANNER_SLOT_LIMIT_EXCEEDED` | Club already has 4 active Core Members with `SCAN_ATTENDANCE` | Remove `SCAN_ATTENDANCE` from an existing Core Member or use President/VP account |
| `409 Conflict` on QR Scan | Ticket already scanned for this event | Check **Verified Check-In Ledger**; duplicate attendance is intentionally blocked |
