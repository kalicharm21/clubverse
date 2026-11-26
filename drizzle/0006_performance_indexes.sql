-- 0006_performance_indexes.sql
-- 1. Accelerates app_is_club_admin(), app_is_club_president(), app_has_club_permission(), and auth.resolveContext
CREATE INDEX IF NOT EXISTS idx_club_memberships_user_status_club
  ON public.club_memberships (user_id, status, club_id);

-- 2. Accelerates event registration counts, waitlist window ordering, and attendance summaries
CREATE INDEX IF NOT EXISTS idx_registrations_event_status_submitted
  ON public.registrations (event_id, status, submitted_at ASC);

CREATE INDEX IF NOT EXISTS idx_registrations_user_submitted
  ON public.registrations (user_id, submitted_at DESC);

-- 3. Accelerates ticket release batching and attendance summary FILTER counts
CREATE INDEX IF NOT EXISTS idx_tickets_event_status
  ON public.tickets (event_id, status);

-- 4. Accelerates unread badge counts and user notification feeds
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications (user_id, is_read, created_at DESC);

-- 5. Accelerates public event discovery and club event management filters
CREATE INDEX IF NOT EXISTS idx_events_status_starts_at
  ON public.events (status, starts_at ASC);

CREATE INDEX IF NOT EXISTS idx_events_club_status_starts_at
  ON public.events (club_id, status, starts_at ASC);

-- 6. Accelerates finance ledger aggregations by club and event
CREATE INDEX IF NOT EXISTS idx_finance_entries_club_event_date
  ON public.finance_entries (club_id, event_id, transaction_date DESC);