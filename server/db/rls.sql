-- CampusVerse Phase 2: Database Privilege Separation, Integrity Triggers & Row-Level Security (RLS)
-- Apply using DATABASE_MIGRATION_URL (privileged migration role).

-- 1. Helper functions for transaction-local RLS context (`set_config(..., ..., true)`)
CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw_val text;
BEGIN
  raw_val := NULLIF(current_setting('app.current_user_id', true), '');
  IF raw_val IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw_val::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_current_global_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_global_role', true), ''), 'public');
$$;

CREATE OR REPLACE FUNCTION public.app_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_global_role() = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION public.app_is_system_auth()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_global_role() IN ('auth_resolver', 'system_seed', 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.app_is_club_admin(target_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_memberships cm
    WHERE cm.user_id = public.app_current_user_id()
      AND cm.club_id = target_club_id
      AND cm.membership_role IN ('president', 'vice_president')
      AND cm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_club_president(target_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_memberships cm
    WHERE cm.user_id = public.app_current_user_id()
      AND cm.club_id = target_club_id
      AND cm.membership_role = 'president'
      AND cm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_club_member(target_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_memberships cm
    WHERE cm.user_id = public.app_current_user_id()
      AND cm.club_id = target_club_id
      AND cm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_has_club_permission(target_club_id uuid, perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_memberships cm
    WHERE cm.user_id = public.app_current_user_id()
      AND cm.club_id = target_club_id
      AND cm.status = 'active'
      AND (
        cm.membership_role IN ('president', 'vice_president')
        OR cm.permissions @> jsonb_build_array(perm)
      )
  );
$$;

-- Narrow read-only helpers (no user email or student_id exposed)
CREATE OR REPLACE FUNCTION public.get_public_club_member_counts()
RETURNS TABLE(club_id uuid, member_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.club_id, count(*)::int AS member_count
  FROM public.club_memberships cm
  JOIN public.clubs c ON c.id = cm.club_id
  WHERE cm.status = 'active'
    AND c.status = 'active'
  GROUP BY cm.club_id;
$$;

CREATE OR REPLACE FUNCTION public.get_live_club_follow_counts()
RETURNS TABLE(club_id uuid, follower_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cf.club_id, count(*)::int AS follower_count
  FROM public.club_follows cf
  GROUP BY cf.club_id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_club_team(p_club_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  user_name text,
  club_id uuid,
  membership_role text,
  title text,
  permissions jsonb,
  assigned_tasks jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cm.id,
    cm.user_id,
    u.display_name AS user_name,
    cm.club_id,
    cm.membership_role,
    cm.title,
    cm.permissions,
    cm.assigned_tasks,
    cm.created_at
  FROM public.club_memberships cm
  JOIN public.users u ON u.id = cm.user_id
  JOIN public.clubs c ON c.id = cm.club_id
  WHERE cm.club_id = p_club_id
    AND cm.status = 'active'
    AND (
      c.status = 'active'
      OR public.app_is_system_auth()
      OR EXISTS (
        SELECT 1 FROM public.club_memberships self_cm
        WHERE self_cm.club_id = p_club_id
          AND self_cm.user_id = public.app_current_user_id()
          AND self_cm.status = 'active'
      )
    )
  ORDER BY
    (cm.membership_role = 'president') DESC,
    (cm.membership_role = 'vice_president') DESC,
    cm.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_club_follow_target(p_club_id_or_slug text)
RETURNS TABLE(id uuid, name text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.status
  FROM public.clubs c
  WHERE (c.id::text = p_club_id_or_slug OR c.slug = p_club_id_or_slug)
  LIMIT 1;
$$;

-- 2. Database-level privilege escalation protection on users table
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.app_current_global_role() NOT IN ('super_admin', 'system_seed', 'auth_resolver') THEN
    IF NEW.global_role IS DISTINCT FROM OLD.global_role OR NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      RAISE EXCEPTION 'Privilege escalation denied: users cannot modify global_role or account_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_privilege_escalation ON public.users;
CREATE TRIGGER trg_prevent_user_privilege_escalation
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_privilege_escalation();

-- 2b. Database-level status & follower_count protection on clubs table
CREATE OR REPLACE FUNCTION public.prevent_club_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.app_current_global_role() NOT IN ('super_admin', 'system_seed') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Privilege escalation denied: only Super Admin can modify club status';
    END IF;
    IF NEW.follower_count IS DISTINCT FROM OLD.follower_count AND pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'Integrity violation: follower_count is maintained transactionally';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_club_privilege_escalation ON public.clubs;
CREATE TRIGGER trg_prevent_club_privilege_escalation
BEFORE UPDATE ON public.clubs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_club_privilege_escalation();

-- 2c. Database-level Club Leadership protection (only Super Admin or trusted invitation activation can assign/modify/remove president & vice_president)
CREATE OR REPLACE FUNCTION public.prevent_club_admin_membership_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.app_current_global_role() NOT IN ('super_admin', 'system_seed', 'invitation_activator') THEN
    IF TG_OP = 'INSERT' AND NEW.membership_role IN ('president', 'vice_president') THEN
      RAISE EXCEPTION 'Privilege escalation denied: only Super Admin can assign President or Vice President memberships';
    ELSIF TG_OP = 'UPDATE' AND (NEW.membership_role IN ('president', 'vice_president') OR OLD.membership_role IN ('president', 'vice_president')) THEN
      RAISE EXCEPTION 'Privilege escalation denied: only Super Admin can modify President or Vice President memberships';
    ELSIF TG_OP = 'DELETE' AND OLD.membership_role IN ('president', 'vice_president') THEN
      RAISE EXCEPTION 'Privilege escalation denied: only Super Admin can remove President or Vice President memberships';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_club_admin_membership_escalation ON public.club_memberships;
CREATE TRIGGER trg_prevent_club_admin_membership_escalation
BEFORE INSERT OR UPDATE OR DELETE ON public.club_memberships
FOR EACH ROW
EXECUTE FUNCTION public.prevent_club_admin_membership_escalation();

-- 2d. Database-level 4 Core Member QR Scanner limit per club (President & VP excluded)
CREATE OR REPLACE FUNCTION public.enforce_four_core_scanner_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_scanner_count integer;
BEGIN
  IF NEW.membership_role = 'core_member'
     AND NEW.status = 'active'
     AND NEW.permissions @> '["SCAN_ATTENDANCE"]'::jsonb THEN
    PERFORM pg_advisory_xact_lock(hashtext('scanner_limit:' || NEW.club_id::text));
    SELECT count(*)::int INTO active_scanner_count
    FROM public.club_memberships cm
    WHERE cm.club_id = NEW.club_id
      AND cm.membership_role = 'core_member'
      AND cm.status = 'active'
      AND cm.permissions @> '["SCAN_ATTENDANCE"]'::jsonb
      AND cm.id IS DISTINCT FROM NEW.id;
    IF active_scanner_count >= 4 THEN
      RAISE EXCEPTION 'SCANNER_SLOT_LIMIT_EXCEEDED: Maximum 4 active Core Members with QR scanning permission allowed per club';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_four_core_scanner_limit ON public.club_memberships;
CREATE TRIGGER trg_enforce_four_core_scanner_limit
BEFORE INSERT OR UPDATE ON public.club_memberships
FOR EACH ROW
EXECUTE FUNCTION public.enforce_four_core_scanner_limit();

-- 3. Transactional follower_count sync trigger (prevents client-supplied follower counts)
CREATE OR REPLACE FUNCTION public.sync_club_follower_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.clubs
    SET follower_count = follower_count + 1, updated_at = NOW()
    WHERE id = NEW.club_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.clubs
    SET follower_count = GREATEST(0, follower_count - 1), updated_at = NOW()
    WHERE id = OLD.club_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_club_follower_count ON public.club_follows;
CREATE TRIGGER trg_sync_club_follower_count
AFTER INSERT OR DELETE ON public.club_follows
FOR EACH ROW
EXECUTE FUNCTION public.sync_club_follower_count();

-- 4. Transactional event registered_count sync trigger (counts confirmed + attended seats)
CREATE OR REPLACE FUNCTION public.sync_event_registered_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('confirmed', 'attended') THEN
    UPDATE public.events
    SET registered_count = registered_count + 1, updated_at = NOW()
    WHERE id = NEW.event_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.status IN ('confirmed', 'attended') THEN
    UPDATE public.events
    SET registered_count = GREATEST(0, registered_count - 1), updated_at = NOW()
    WHERE id = OLD.event_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('confirmed', 'attended') AND NEW.status NOT IN ('confirmed', 'attended') THEN
      UPDATE public.events
      SET registered_count = GREATEST(0, registered_count - 1), updated_at = NOW()
      WHERE id = NEW.event_id;
    ELSIF OLD.status NOT IN ('confirmed', 'attended') AND NEW.status IN ('confirmed', 'attended') THEN
      UPDATE public.events
      SET registered_count = registered_count + 1, updated_at = NOW()
      WHERE id = NEW.event_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_registered_count ON public.registrations;
CREATE TRIGGER trg_sync_event_registered_count
AFTER INSERT OR UPDATE OR DELETE ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.sync_event_registered_count();

-- 4b. Atomic FIFO waitlist promotion helper on cancellation (respects capacity under lock)
CREATE OR REPLACE FUNCTION public.promote_next_waitlisted_registration(p_event_id uuid)
RETURNS TABLE(promoted_registration_id uuid, promoted_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event record;
  v_candidate record;
BEGIN
  SELECT id, title, capacity, registered_count, status
  INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND OR v_event.status IN ('cancelled', 'completed', 'draft') THEN
    RETURN;
  END IF;

  IF v_event.registered_count >= v_event.capacity THEN
    RETURN;
  END IF;

  SELECT r.id, r.user_id
  INTO v_candidate
  FROM public.registrations r
  WHERE r.event_id = p_event_id
    AND r.status = 'waitlisted'
  ORDER BY r.submitted_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.registrations
  SET status = 'confirmed'
  WHERE id = v_candidate.id;

  INSERT INTO public.notifications (user_id, type, title, message, link, is_read)
  VALUES (
    v_candidate.user_id,
    'registration',
    'Waitlist Seat Confirmed',
    'A seat opened up for ' || v_event.title || '. Your registration is confirmed. Your ticket will be available once the club releases tickets.',
    '/app/my-registrations',
    false
  );

  promoted_registration_id := v_candidate.id;
  promoted_user_id := v_candidate.user_id;
  RETURN NEXT;
END;
$$;

-- 5. Enable Row-Level Security on all 19 application tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_of_fame_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

-- 6. Explicit RLS Policies (idempotent drop + create)

-- users (Never expose PII to unauthenticated/public sessions)
DROP POLICY IF EXISTS users_select_policy ON public.users;
CREATE POLICY users_select_policy ON public.users
  FOR SELECT USING (
    public.app_is_system_auth()
    OR public.app_current_global_role() = 'invitation_activator'
    OR id = public.app_current_user_id()
    OR (
      public.app_current_user_id() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.club_memberships cm
        WHERE cm.user_id = users.id
          AND cm.status = 'active'
          AND public.app_is_club_admin(cm.club_id)
      )
    )
    OR (
      public.app_current_user_id() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.registrations r
        JOIN public.events e ON e.id = r.event_id
        WHERE r.user_id = users.id
          AND (
            public.app_has_club_permission(e.club_id, 'VIEW_REGISTRATIONS')
            OR public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
          )
      )
    )
  );

DROP POLICY IF EXISTS users_insert_policy ON public.users;
CREATE POLICY users_insert_policy ON public.users
  FOR INSERT WITH CHECK (
    public.app_is_system_auth()
    OR public.app_current_global_role() = 'invitation_activator'
  );

DROP POLICY IF EXISTS users_update_policy ON public.users;
CREATE POLICY users_update_policy ON public.users
  FOR UPDATE USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() IN ('auth_resolver', 'invitation_activator')
    OR id = public.app_current_user_id()
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() IN ('auth_resolver', 'invitation_activator')
    OR id = public.app_current_user_id()
  );

-- clubs
DROP POLICY IF EXISTS clubs_select_policy ON public.clubs;
CREATE POLICY clubs_select_policy ON public.clubs
  FOR SELECT USING (
    status = 'active'
    OR public.app_is_system_auth()
    OR public.app_current_global_role() = 'invitation_activator'
    OR public.app_is_club_admin(id)
    OR public.app_is_club_member(id)
  );

DROP POLICY IF EXISTS clubs_insert_policy ON public.clubs;
CREATE POLICY clubs_insert_policy ON public.clubs
  FOR INSERT WITH CHECK (
    public.app_is_super_admin() OR public.app_current_global_role() = 'system_seed'
  );

DROP POLICY IF EXISTS clubs_update_policy ON public.clubs;
CREATE POLICY clubs_update_policy ON public.clubs
  FOR UPDATE USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_is_club_admin(id)
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_is_club_admin(id)
  );

-- club_memberships
DROP POLICY IF EXISTS club_memberships_select_policy ON public.club_memberships;
CREATE POLICY club_memberships_select_policy ON public.club_memberships
  FOR SELECT USING (
    public.app_is_system_auth()
    OR public.app_current_global_role() = 'invitation_activator'
    OR user_id = public.app_current_user_id()
    OR public.app_is_club_admin(club_id)
    OR (
      public.app_current_user_id() IS NOT NULL
      AND status = 'active'
      AND public.app_is_club_member(club_id)
    )
  );

DROP POLICY IF EXISTS club_memberships_modify_policy ON public.club_memberships;
CREATE POLICY club_memberships_modify_policy ON public.club_memberships
  FOR ALL USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() IN ('system_seed', 'invitation_activator')
    OR public.app_is_club_admin(club_id)
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() IN ('system_seed', 'invitation_activator')
    OR public.app_is_club_admin(club_id)
  );

-- club_invitations (Token hashes never leaked to general students)
DROP POLICY IF EXISTS club_invitations_select_policy ON public.club_invitations;
CREATE POLICY club_invitations_select_policy ON public.club_invitations
  FOR SELECT USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() IN ('system_seed', 'invitation_activator')
    OR public.app_is_club_admin(club_id)
  );

DROP POLICY IF EXISTS club_invitations_insert_policy ON public.club_invitations;
CREATE POLICY club_invitations_insert_policy ON public.club_invitations
  FOR INSERT WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR (public.app_is_club_admin(club_id) AND intended_role = 'core_member')
  );

DROP POLICY IF EXISTS club_invitations_update_policy ON public.club_invitations;
CREATE POLICY club_invitations_update_policy ON public.club_invitations
  FOR UPDATE USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() IN ('system_seed', 'invitation_activator')
    OR (public.app_is_club_admin(club_id) AND intended_role = 'core_member')
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() IN ('system_seed', 'invitation_activator')
    OR (public.app_is_club_admin(club_id) AND intended_role = 'core_member')
  );

DROP POLICY IF EXISTS club_invitations_delete_policy ON public.club_invitations;
CREATE POLICY club_invitations_delete_policy ON public.club_invitations
  FOR DELETE USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR (public.app_is_club_admin(club_id) AND intended_role = 'core_member')
  );

-- club_follows
DROP POLICY IF EXISTS club_follows_select_policy ON public.club_follows;
CREATE POLICY club_follows_select_policy ON public.club_follows
  FOR SELECT USING (
    user_id = public.app_current_user_id()
    OR public.app_is_super_admin()
    OR public.app_current_global_role() = 'auth_resolver'
  );

DROP POLICY IF EXISTS club_follows_insert_policy ON public.club_follows;
CREATE POLICY club_follows_insert_policy ON public.club_follows
  FOR INSERT WITH CHECK (
    user_id = public.app_current_user_id()
    OR public.app_current_global_role() = 'system_seed'
  );

DROP POLICY IF EXISTS club_follows_delete_policy ON public.club_follows;
CREATE POLICY club_follows_delete_policy ON public.club_follows
  FOR DELETE USING (
    user_id = public.app_current_user_id()
    OR public.app_is_super_admin()
  );

-- events
DROP POLICY IF EXISTS events_select_policy ON public.events;
CREATE POLICY events_select_policy ON public.events
  FOR SELECT USING (
    status IN ('published', 'registration_open', 'registration_closed', 'completed')
    OR public.app_is_system_auth()
    OR public.app_has_club_permission(club_id, 'MANAGE_EVENTS')
    OR public.app_has_club_permission(club_id, 'MANAGE_FORMS')
    OR public.app_has_club_permission(club_id, 'VIEW_REGISTRATIONS')
    OR public.app_has_club_permission(club_id, 'SCAN_ATTENDANCE')
    OR public.app_has_club_permission(club_id, 'SUBMIT_EVENT_REPORTS')
    OR public.app_has_club_permission(club_id, 'SUBMIT_FINANCE_REPORTS')
  );

DROP POLICY IF EXISTS events_insert_policy ON public.events;
CREATE POLICY events_insert_policy ON public.events
  FOR INSERT WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'MANAGE_EVENTS')
  );

DROP POLICY IF EXISTS events_update_policy ON public.events;
CREATE POLICY events_update_policy ON public.events
  FOR UPDATE USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'MANAGE_EVENTS')
    OR public.app_has_club_permission(club_id, 'SUBMIT_EVENT_REPORTS')
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'MANAGE_EVENTS')
    OR public.app_has_club_permission(club_id, 'SUBMIT_EVENT_REPORTS')
  );

-- event_forms
DROP POLICY IF EXISTS event_forms_select_policy ON public.event_forms;
CREATE POLICY event_forms_select_policy ON public.event_forms
  FOR SELECT USING (
    public.app_is_system_auth()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_forms.event_id
        AND (
          e.status IN ('published', 'registration_open', 'registration_closed', 'completed')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  );

DROP POLICY IF EXISTS event_forms_modify_policy ON public.event_forms;
CREATE POLICY event_forms_modify_policy ON public.event_forms
  FOR ALL USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_forms.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_forms.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  );

-- form_fields
DROP POLICY IF EXISTS form_fields_select_policy ON public.form_fields;
CREATE POLICY form_fields_select_policy ON public.form_fields
  FOR SELECT USING (
    public.app_is_system_auth()
    OR EXISTS (
      SELECT 1 FROM public.event_forms ef
      JOIN public.events e ON e.id = ef.event_id
      WHERE ef.id = form_fields.form_id
        AND (
          e.status IN ('published', 'registration_open', 'registration_closed', 'completed')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  );

DROP POLICY IF EXISTS form_fields_modify_policy ON public.form_fields;
CREATE POLICY form_fields_modify_policy ON public.form_fields
  FOR ALL USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.event_forms ef
      JOIN public.events e ON e.id = ef.event_id
      WHERE ef.id = form_fields.form_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.event_forms ef
      JOIN public.events e ON e.id = ef.event_id
      WHERE ef.id = form_fields.form_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  );

-- event_form_versions (Append-only immutable published snapshots)
DROP POLICY IF EXISTS event_form_versions_select_policy ON public.event_form_versions;
CREATE POLICY event_form_versions_select_policy ON public.event_form_versions
  FOR SELECT USING (
    public.app_is_system_auth()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_form_versions.event_id
        AND (
          e.status IN ('published', 'registration_open', 'registration_closed', 'completed')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
          OR public.app_has_club_permission(e.club_id, 'VIEW_REGISTRATIONS')
        )
    )
  );

DROP POLICY IF EXISTS event_form_versions_insert_policy ON public.event_form_versions;
CREATE POLICY event_form_versions_insert_policy ON public.event_form_versions
  FOR INSERT WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_form_versions.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_FORMS')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  );

-- registrations (Private student form answers & QR credentials)
DROP POLICY IF EXISTS registrations_select_policy ON public.registrations;
CREATE POLICY registrations_select_policy ON public.registrations
  FOR SELECT USING (
    public.app_is_super_admin()
    OR user_id = public.app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = registrations.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'VIEW_REGISTRATIONS')
          OR public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
        )
    )
  );

DROP POLICY IF EXISTS registrations_insert_policy ON public.registrations;
CREATE POLICY registrations_insert_policy ON public.registrations
  FOR INSERT WITH CHECK (
    user_id = public.app_current_user_id()
    OR public.app_current_global_role() = 'system_seed'
  );

DROP POLICY IF EXISTS registrations_update_policy ON public.registrations;
CREATE POLICY registrations_update_policy ON public.registrations
  FOR UPDATE USING (
    public.app_is_super_admin()
    OR user_id = public.app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = registrations.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
          OR public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
        )
    )
  );

-- tickets (Strict participant ownership & event officer release/scan scoping)
DROP POLICY IF EXISTS tickets_select_policy ON public.tickets;
CREATE POLICY tickets_select_policy ON public.tickets
  FOR SELECT USING (
    public.app_is_super_admin()
    OR public.app_is_system_auth()
    OR user_id = public.app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tickets.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
          OR public.app_has_club_permission(e.club_id, 'VIEW_REGISTRATIONS')
          OR public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
        )
    )
  );

DROP POLICY IF EXISTS tickets_insert_policy ON public.tickets;
CREATE POLICY tickets_insert_policy ON public.tickets
  FOR INSERT WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR user_id = public.app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tickets.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
          OR public.app_is_club_admin(e.club_id)
        )
    )
  );

DROP POLICY IF EXISTS tickets_update_policy ON public.tickets;
CREATE POLICY tickets_update_policy ON public.tickets
  FOR UPDATE USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tickets.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
          OR public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
          OR public.app_is_club_admin(e.club_id)
        )
    )
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tickets.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'MANAGE_EVENTS')
          OR public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
          OR public.app_is_club_admin(e.club_id)
        )
    )
  );

-- attendance_records
DROP POLICY IF EXISTS attendance_select_policy ON public.attendance_records;
CREATE POLICY attendance_select_policy ON public.attendance_records
  FOR SELECT USING (
    public.app_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.id = attendance_records.registration_id
        AND r.user_id = public.app_current_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = attendance_records.event_id
        AND (
          public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
          OR public.app_has_club_permission(e.club_id, 'VIEW_REGISTRATIONS')
        )
    )
  );

DROP POLICY IF EXISTS attendance_insert_policy ON public.attendance_records;
CREATE POLICY attendance_insert_policy ON public.attendance_records
  FOR INSERT WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = attendance_records.event_id
        AND public.app_has_club_permission(e.club_id, 'SCAN_ATTENDANCE')
    )
  );

-- event_reports
DROP POLICY IF EXISTS event_reports_select_policy ON public.event_reports;
CREATE POLICY event_reports_select_policy ON public.event_reports
  FOR SELECT USING (
    public.app_is_super_admin()
    OR public.app_has_club_permission(club_id, 'SUBMIT_EVENT_REPORTS')
  );

DROP POLICY IF EXISTS event_reports_modify_policy ON public.event_reports;
CREATE POLICY event_reports_modify_policy ON public.event_reports
  FOR ALL USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'SUBMIT_EVENT_REPORTS')
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'SUBMIT_EVENT_REPORTS')
  );

-- finance_reports & finance_line_items (Strictly blocked for general students)
DROP POLICY IF EXISTS finance_reports_policy ON public.finance_reports;
CREATE POLICY finance_reports_policy ON public.finance_reports
  FOR ALL USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'SUBMIT_FINANCE_REPORTS')
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'SUBMIT_FINANCE_REPORTS')
  );

DROP POLICY IF EXISTS finance_line_items_policy ON public.finance_line_items;
CREATE POLICY finance_line_items_policy ON public.finance_line_items
  FOR ALL USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.finance_reports fr
      WHERE fr.id = finance_line_items.finance_report_id
        AND public.app_has_club_permission(fr.club_id, 'SUBMIT_FINANCE_REPORTS')
    )
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR EXISTS (
      SELECT 1 FROM public.finance_reports fr
      WHERE fr.id = finance_line_items.finance_report_id
        AND public.app_has_club_permission(fr.club_id, 'SUBMIT_FINANCE_REPORTS')
    )
  );

DROP POLICY IF EXISTS finance_entries_policy ON public.finance_entries;
CREATE POLICY finance_entries_policy ON public.finance_entries
  FOR ALL USING (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'SUBMIT_FINANCE_REPORTS')
  )
  WITH CHECK (
    public.app_is_super_admin()
    OR public.app_current_global_role() = 'system_seed'
    OR public.app_has_club_permission(club_id, 'SUBMIT_FINANCE_REPORTS')
  );

-- notifications
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT USING (
    user_id = public.app_current_user_id() OR public.app_is_super_admin()
  );

DROP POLICY IF EXISTS notifications_insert_policy ON public.notifications;
CREATE POLICY notifications_insert_policy ON public.notifications
  FOR INSERT WITH CHECK (
    user_id = public.app_current_user_id()
    OR public.app_is_super_admin()
    OR public.app_current_global_role() IN ('system_seed', 'invitation_activator')
    OR (
      public.app_current_user_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.club_memberships cm
        WHERE cm.user_id = public.app_current_user_id()
          AND cm.status = 'active'
          AND (
            cm.membership_role IN ('president', 'vice_president')
            OR cm.permissions @> '["MANAGE_EVENTS"]'::jsonb
            OR cm.permissions @> '["SUBMIT_EVENT_REPORTS"]'::jsonb
          )
      )
    )
  );

DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;
CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE USING (
    user_id = public.app_current_user_id() OR public.app_is_super_admin()
  );

-- audit_logs (Append-only: SELECT for super_admin, INSERT for app contexts, NO UPDATE/DELETE)
DROP POLICY IF EXISTS audit_logs_select_policy ON public.audit_logs;
CREATE POLICY audit_logs_select_policy ON public.audit_logs
  FOR SELECT USING (
    public.app_is_super_admin()
  );

DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;
CREATE POLICY audit_logs_insert_policy ON public.audit_logs
  FOR INSERT WITH CHECK (
    public.app_current_global_role() IN ('user', 'super_admin', 'auth_resolver', 'system_seed', 'invitation_activator')
  );

-- system_settings
DROP POLICY IF EXISTS system_settings_select_policy ON public.system_settings;
CREATE POLICY system_settings_select_policy ON public.system_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS system_settings_modify_policy ON public.system_settings;
CREATE POLICY system_settings_modify_policy ON public.system_settings
  FOR ALL USING (
    public.app_is_super_admin() OR public.app_current_global_role() = 'system_seed'
  )
  WITH CHECK (
    public.app_is_super_admin() OR public.app_current_global_role() = 'system_seed'
  );

-- hall_of_fame_snapshots
DROP POLICY IF EXISTS hof_snapshots_select_policy ON public.hall_of_fame_snapshots;
CREATE POLICY hof_snapshots_select_policy ON public.hall_of_fame_snapshots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS hof_snapshots_insert_policy ON public.hall_of_fame_snapshots;
CREATE POLICY hof_snapshots_insert_policy ON public.hall_of_fame_snapshots
  FOR INSERT WITH CHECK (
    public.app_is_super_admin() OR public.app_current_global_role() = 'system_seed'
  );

-- auth_sessions
DROP POLICY IF EXISTS auth_sessions_policy ON public.auth_sessions;
CREATE POLICY auth_sessions_policy ON public.auth_sessions
  FOR ALL USING (
    user_id = public.app_current_user_id() OR public.app_is_system_auth()
  )
  WITH CHECK (
    user_id = public.app_current_user_id() OR public.app_is_system_auth()
  );

-- 7. Explicit Function Execute Privilege Separation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'campusverse_app') THEN
    REVOKE ALL ON FUNCTION public.app_current_user_id() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.app_current_global_role() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.app_is_super_admin() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.app_is_system_auth() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.app_is_club_admin(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.app_is_club_president(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.app_is_club_member(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.app_has_club_permission(uuid, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_public_club_member_counts() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_live_club_follow_counts() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_public_club_team(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_club_follow_target(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.promote_next_waitlisted_registration(uuid) FROM PUBLIC;

    GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.app_current_global_role() TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.app_is_super_admin() TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.app_is_system_auth() TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.app_is_club_admin(uuid) TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.app_is_club_president(uuid) TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.app_is_club_member(uuid) TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.app_has_club_permission(uuid, text) TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.get_public_club_member_counts() TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.get_live_club_follow_counts() TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.get_public_club_team(uuid) TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.get_club_follow_target(text) TO campusverse_app;
    GRANT EXECUTE ON FUNCTION public.promote_next_waitlisted_registration(uuid) TO campusverse_app;
  END IF;
END
$$;
