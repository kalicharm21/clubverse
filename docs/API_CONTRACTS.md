# API Contracts (`/api/v1`)

All endpoints return JSON envelopes:
- Success: `{ "success": true, "data": <payload>, "meta"?: <pagination|metadata> }`
- Error: `{ "success": false, "error": { "code": "<ERROR_CODE>", "message": "<human-readable>", "details"?: ... } }`

Protected endpoints require `Authorization: Bearer <supabase_access_token>` unless marked **Public**.

---

## 1. Health & Auth

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/health` | `GET` | Public | API status, persistence mode, and current phase (`phase-5`) |
| `/api/v1/health/ready` | `GET` | Public | Live PostgreSQL `SELECT 1` readiness & latency check (`200` or `503`) |
| `/api/v1/auth/config` | `GET` | Public | Auth mode (`supabase` \| `demo`), `demoModeEnabled`, Supabase public URL/key, institutional domains |
| `/api/v1/auth/me` | `GET` | Authenticated | Hydrated `user`, active `memberships`, and `followedClubIds` |
| `/api/v1/auth/session` | `POST` | Authenticated | Records non-sensitive session audit metadata |
| `/api/v1/auth/demo-personas` | `GET` | Public (Demo only) | Development personas (`403` when demo mode disabled) |
| `/api/v1/auth/demo-login` | `POST` | Public (Demo only) | Demo persona sign-in (`403` when demo mode disabled) |

---

## 2. Users & Following

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/users/me` | `GET` | Authenticated | Current authenticated student/staff profile |
| `/api/v1/users/me` | `PUT` / `PATCH` | Authenticated | Strict Zod update (`name`, `department`, `yearOfStudy` only; rejects `globalRole`/`status`) |
| `/api/v1/users/me/followed-clubs` | `GET` | Authenticated | Active followed clubs + `meta: { count, limit: 2 }` |
| `/api/v1/memberships/me` | `GET` | Authenticated | Authenticated user's active club memberships & follow IDs |

---

## 3. Clubs, Leadership, Invitations & Hall of Fame

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/clubs` | `GET` | Public | Paginated/filtered active clubs with live follower counts (`?search=&category=&sortBy=&page=&pageSize=`) |
| `/api/v1/clubs` | `POST` | `super_admin` | Create club (supports optional validated `instagramUrl`) |
| `/api/v1/clubs/:clubId` | `GET` | Public | Club details (active-only for students/public; team `userEmail` redacted unless Super Admin or club officer) |
| `/api/v1/clubs/:clubId` | `PATCH` | `club_admin` (President/VP) or `super_admin` | Update club profile including normalized `instagramUrl` (`https://www.instagram.com/<handle>/` or `""`) |
| `/api/v1/clubs/:clubId/status` | `PATCH` | `super_admin` | Transition club status (`active`, `inactive`, `suspended`, `pending_review`) |
| `/api/v1/clubs/:clubId/follow` | `POST` / `DELETE` | Authenticated | Follow active club (enforces max 2 per student under `FOR UPDATE`) or unfollow |
| `/api/v1/clubs/:clubId/members` | `GET` / `POST` | `MANAGE_MEMBERS` or `super_admin` | List club roster or add core member (`409` duplicate; `422 SCANNER_SLOT_LIMIT_EXCEEDED` above 4 active Core scanners) |
| `/api/v1/clubs/:clubId/members/:membershipId` | `PATCH` / `DELETE` | `MANAGE_MEMBERS` or `super_admin` | Update role/permissions or remove member (President/VP edits restricted to `super_admin`; VP cannot alter President) |
| `/api/v1/clubs/:clubId/invitations` | `GET` / `POST` | `MANAGE_MEMBERS` or `super_admin` | List invitations / issue tokenized SHA-256 invitation (`422` if >4 core scanners) |
| `/api/v1/clubs/:clubId/invitations/:invitationId/resend` | `POST` | `MANAGE_MEMBERS` or `super_admin` | Rotate token hash and extend expiry |
| `/api/v1/clubs/:clubId/invitations/:invitationId` | `DELETE` | `MANAGE_MEMBERS` or `super_admin` | Revoke pending invitation |
| `/api/v1/invitations/preview` | `GET` | Public | Preview non-sensitive club invitation metadata by `?token=` |
| `/api/v1/invitations/accept` | `POST` | Authenticated | Single-use invitation redemption verifying institutional email match |
| `/api/v1/hall-of-fame` | `GET` | Public | Live active-club leaderboard with standard competition ranking (`1, 2, 2, 4`) |

---

## 4. Events & Custom Forms

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/events` | `GET` | Public | Server-filtered & paginated events (`?search=&category=&clubId=&status=&upcomingOnly=&page=&pageSize=`) |
| `/api/v1/events/:eventId` | `GET` | Public | Event detail metadata |
| `/api/v1/clubs/:clubId/events` | `POST` | `MANAGE_EVENTS` | Create draft event |
| `/api/v1/events/:eventId` | `PATCH` | `MANAGE_EVENTS` | Update event details / eligibility rules / capacity |
| `/api/v1/events/:eventId/publish` | `POST` | `MANAGE_EVENTS` | Transition `draft` → `published` (requires active club) |
| `/api/v1/events/:eventId/open-registration` | `POST` | `MANAGE_EVENTS` | Transition `published` → `registration_open` |
| `/api/v1/events/:eventId/close-registration` | `POST` | `MANAGE_EVENTS` | Transition to `registration_closed` |
| `/api/v1/events/:eventId/complete` | `POST` | `MANAGE_EVENTS` | Transition to `completed` |
| `/api/v1/events/:eventId/cancel` | `POST` | `MANAGE_EVENTS` | Cancel event |
| `/api/v1/events/:eventId/form` | `GET` | Public / `MANAGE_FORMS` | Retrieve form; pass `?publishedOnly=true` (returns `422 FORM_NOT_PUBLISHED` if unpublished) or `?version=N` |
| `/api/v1/events/:eventId/form` | `PUT` | `MANAGE_FORMS` | Save draft form fields (10 field types + `validationRules.pattern` regex validation) |
| `/api/v1/events/:eventId/form/publish` | `POST` | `MANAGE_FORMS` | Validate & snapshot immutable `event_form_versions` (`201 Created`) |

---

## 5. Registrations, Controlled Tickets & Attendance

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/events/:eventId/registrations` | `POST` | Authenticated | Validate published form answers, enforce capacity/eligibility/deadline, create registration (`ticketStatus: 'not_released'`, `qrToken: ''`) |
| `/api/v1/events/:eventId/registrations` | `GET` | `VIEW_REGISTRATIONS` | Paginated participant roster (`?page=&pageSize=&search=&status=`) |
| `/api/v1/events/:eventId/registrations/export` | `GET` | `VIEW_REGISTRATIONS` | Formula-safe CSV export of registrations + historical form answers |
| `/api/v1/events/:eventId/registrations/me` | `DELETE` | Authenticated | Cancel student's registration and atomically FIFO-promote waitlisted participant |
| `/api/v1/registrations/me` | `GET` | Authenticated | Student's registrations (masks `qrToken` unless `ticketStatus === 'released'`) |
| `/api/v1/users/me/registrations` | `GET` | Authenticated | Alias of `/api/v1/registrations/me` |
| `/api/v1/registrations/:registrationId` | `GET` | Owner or `VIEW_REGISTRATIONS` | Individual registration detail |
| `/api/v1/events/:eventId/tickets/release` | `POST` | `MANAGE_EVENTS` | Transactionally & idempotently batch-release tickets, store token hashes/sealed tokens, and notify participants |
| `/api/v1/events/:eventId/tickets` | `GET` | `VIEW_REGISTRATIONS` | List event ticket records & release/revocation states |
| `/api/v1/tickets/me` | `GET` | Authenticated | Student's ticket passes (exposes unsealed `qrToken` strictly when `status === 'released'`) |
| `/api/v1/tickets/:ticketId/revoke` | `POST` | `MANAGE_EVENTS` on ticket's event | Revoke an individual ticket pass |
| `/api/v1/events/:eventId/attendance/scan` | `POST` | `SCAN_ATTENDANCE` | Verify opaque QR token (`CV-TCK-...`) or audited manual override; rejects unreleased/revoked/wrong-event/duplicate (`409`) |
| `/api/v1/events/:eventId/attendance/verify` | `POST` | `SCAN_ATTENDANCE` | Alias of `/attendance/scan` |
| `/api/v1/events/:eventId/attendance/manual` | `POST` | `SCAN_ATTENDANCE` | Manual check-in requiring `reason` (min 5 chars) |
| `/api/v1/events/:eventId/attendance` | `GET` | `SCAN_ATTENDANCE` | Attendance records + 6 real-time `summary` metrics (`confirmedCount`, `ticketsReleasedCount`, `ticketsNotReleasedCount`, `attendedCount`, `remainingCount`, `attendancePercentage`) |
| `/api/v1/events/:eventId/attendance/export` | `GET` | `SCAN_ATTENDANCE` | Formula-safe CSV export of verified check-ins |

---

## 6. Post-Event Reports, Finance & Super Admin Oversight

| Endpoint | Method | Auth / Permission | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/events/:eventId/report` | `POST` / `GET` | `SUBMIT_EVENT_REPORTS` | Save draft or submit/resubmit structured report (objectives, date, participation, outcomes, highlights, challenges, feedback, `evidenceUrl`) |
| `/api/v1/events/:eventId/finance-report` | `POST` / `GET` | `SUBMIT_FINANCE_REPORTS` | Event financial reconciliation (`numeric` + integer minor units) |
| `/api/v1/clubs/:clubId/finance` | `GET` | `SUBMIT_FINANCE_REPORTS` | Club financial summary + itemized `finance_entries` in integer paise |
| `/api/v1/clubs/:clubId/finance/entries` | `GET` / `POST` | `SUBMIT_FINANCE_REPORTS` | List or create club/event-linked income or expense ledger entry (`amountMinorUnits`) |
| `/api/v1/clubs/:clubId/finance/entries/:entryId` | `DELETE` | `SUBMIT_FINANCE_REPORTS` | Delete club ledger entry |
| `/api/v1/events/:eventId/finance` | `GET` | `SUBMIT_FINANCE_REPORTS` | Event-scoped financial ledger summary & entries |
| `/api/v1/events/:eventId/finance/entries` | `POST` | `SUBMIT_FINANCE_REPORTS` | Create event-linked income or expense entry |
| `/api/v1/notifications` | `GET` | Authenticated | Current user's notification inbox |
| `/api/v1/notifications/read-all` | `POST` | Authenticated | Mark all notifications read |
| `/api/v1/notifications/:id/read` | `PATCH` | Authenticated | Mark single notification read |
| `/api/v1/admin/dashboard` | `GET` | `super_admin` | Institutional KPIs (clubs, events, registrations, attendance, pending/awaiting-approval reports) |
| `/api/v1/admin/analytics` | `GET` | `super_admin` | Live club overview (President/VP, core count, Instagram, followers) + event analytics (registrations, tickets, attendance %, report status, net finance) |
| `/api/v1/admin/clubs` | `GET` | `super_admin` | All clubs filterable by `?status=` |
| `/api/v1/admin/clubs/:clubId/leadership` | `POST` | `super_admin` | Assign or invite Club President / Vice President |
| `/api/v1/admin/clubs/:clubId/status` | `PATCH` | `super_admin` | Update club status |
| `/api/v1/admin/memberships` | `GET` | `super_admin` | Cross-club leadership & core member directory |
| `/api/v1/admin/users` | `GET` | `super_admin` | Institutional users directory |
| `/api/v1/admin/users/:userId/status` | `PATCH` | `super_admin` | Suspend or reactivate user account |
| `/api/v1/admin/reports` | `GET` | `super_admin` | List all post-event completion reports with review audit trails |
| `/api/v1/admin/reports/:reportId/review` | `POST` | `super_admin` | Transition report to `under_review`, `changes_requested`, `approved`, or `rejected` with review notes |
| `/api/v1/admin/reports/export` | `GET` | `super_admin` | Formula-safe CSV export of institutional event reports |
| `/api/v1/admin/finance` | `GET` | `super_admin` | Institution-wide income, expenses, net balance, club-wise & event-wise summaries, and ledger entries |
| `/api/v1/admin/finance/export` | `GET` | `super_admin` | Formula-safe CSV export of institutional finance ledger |
| `/api/v1/admin/audit-logs` | `GET` | `super_admin` | Append-only governance & operational audit log |
| `/api/v1/admin/settings` | `GET` / `PATCH` | `super_admin` | Institutional settings |

---

## 7. Representative Request / Response Examples

### Update Club Instagram Profile
`PATCH /api/v1/clubs/:clubId`
```json
// Request
{ "instagramUrl": "@apex_robotics_vit" }

// Response (200 OK)
{
  "success": true,
  "data": {
    "id": "11111111-1111-4111-8111-111111111101",
    "instagramUrl": "https://www.instagram.com/apex_robotics_vit/"
  }
}
```

### Batch Release Tickets
`POST /api/v1/events/:eventId/tickets/release`
```json
// Request
{ "confirmParticipantCount": 42, "note": "Round 1 entry passes" }

// Response (200 OK)
{
  "success": true,
  "data": {
    "eventId": "...",
    "releasedCount": 42,
    "alreadyReleasedCount": 0,
    "totalReleased": 42,
    "eligibleCount": 42,
    "releasedAt": "2026-11-26T09:15:00.000Z",
    "releasedByName": "Priya Nair",
    "emailDelivery": "not_configured"
  }
}
```

### Record Integer-Paise Finance Entry
`POST /api/v1/clubs/:clubId/finance/entries`
```json
// Request (₹1,500.75 = 150075 paise)
{
  "eventId": "...",
  "entryType": "income",
  "sourceOrCategory": "Sponsorship",
  "description": "Robotics Hardware Grant",
  "amountMinorUnits": 150075,
  "transactionDate": "2026-11-26",
  "vendorOrRecipient": "Acme Tech Foundation"
}

// Response (201 Created)
{
  "success": true,
  "data": {
    "id": "...",
    "entryType": "income",
    "amountMinorUnits": 150075,
    "amount": 1500.75
  }
}
```
