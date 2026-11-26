-- CampusVerse Phase 5 Migration: Instagram URLs, Controlled Ticket Release, Structured Reports Review, & Integer-Paise Finance Ledger

ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "instagram_url" text DEFAULT '' NOT NULL;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tickets_released_at" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tickets_released_by" uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_tickets_released_by_users_id_fk'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_tickets_released_by_users_id_fk"
      FOREIGN KEY ("tickets_released_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

ALTER TABLE "registrations" DROP CONSTRAINT IF EXISTS "chk_registrations_status";
ALTER TABLE "registrations"
  ADD CONSTRAINT "chk_registrations_status"
  CHECK ("status" IN ('pending', 'confirmed', 'waitlisted', 'cancelled', 'attended'));

CREATE TABLE IF NOT EXISTS "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "ticket_code" text NOT NULL,
  "token_hash" text,
  "sealed_token" text,
  "status" text DEFAULT 'not_released' NOT NULL,
  "released_by" uuid,
  "released_at" timestamp with time zone,
  "revoked_by" uuid,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tickets_registration_id_unique" UNIQUE("registration_id"),
  CONSTRAINT "tickets_ticket_code_unique" UNIQUE("ticket_code"),
  CONSTRAINT "tickets_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "chk_tickets_status" CHECK ("status" IN ('not_released', 'released', 'revoked'))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_registration_id_registrations_id_fk') THEN
    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_event_id_events_id_fk') THEN
    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_user_id_users_id_fk') THEN
    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_released_by_users_id_fk') THEN
    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_revoked_by_users_id_fk') THEN
    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_tickets_event_status" ON "tickets" USING btree ("event_id", "status");
CREATE INDEX IF NOT EXISTS "idx_tickets_user" ON "tickets" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_tickets_token_hash" ON "tickets" USING btree ("token_hash");

ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "objectives" text DEFAULT '' NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "actual_event_date" timestamp with time zone;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "participation_summary" text DEFAULT '' NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "outcomes" text DEFAULT '' NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "feedback_observations" text DEFAULT '' NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "evidence_url" text DEFAULT '' NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'submitted' NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "reviewed_by_name" text;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "review_notes" text DEFAULT '' NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "history" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "event_reports" ADD COLUMN IF NOT EXISTS "updated_by" uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_reports_reviewed_by_users_id_fk') THEN
    ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_reports_updated_by_users_id_fk') THEN
    ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "event_reports" DROP CONSTRAINT IF EXISTS "chk_event_reports_status";
ALTER TABLE "event_reports"
  ADD CONSTRAINT "chk_event_reports_status"
  CHECK ("status" IN ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected'));
CREATE INDEX IF NOT EXISTS "idx_event_reports_status" ON "event_reports" USING btree ("status");

ALTER TABLE "finance_reports" ADD COLUMN IF NOT EXISTS "total_collections_minor_units" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "finance_reports" ADD COLUMN IF NOT EXISTS "total_expenses_minor_units" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "finance_reports" ADD COLUMN IF NOT EXISTS "net_balance_minor_units" bigint DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "finance_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "club_id" uuid NOT NULL,
  "event_id" uuid,
  "entry_type" text NOT NULL,
  "source_or_category" text NOT NULL,
  "description" text NOT NULL,
  "amount_minor_units" bigint NOT NULL,
  "transaction_date" timestamp with time zone NOT NULL,
  "vendor_recipient" text DEFAULT '' NOT NULL,
  "receipt_url" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "created_by" uuid,
  "created_by_name" text DEFAULT 'Club Officer' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_finance_entries_type" CHECK ("entry_type" IN ('income', 'expense')),
  CONSTRAINT "chk_finance_entries_amount_minor_units" CHECK ("amount_minor_units" >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_entries_club_id_clubs_id_fk') THEN
    ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_entries_event_id_events_id_fk') THEN
    ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_entries_created_by_users_id_fk') THEN
    ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_finance_entries_club_date" ON "finance_entries" USING btree ("club_id", "transaction_date");
CREATE INDEX IF NOT EXISTS "idx_finance_entries_event" ON "finance_entries" USING btree ("event_id");

-- Backfill tickets & scrub any legacy plaintext QR tokens from registrations
DO $$
BEGIN
  PERFORM set_config('app.current_global_role', 'system_seed', true);

  INSERT INTO "public"."tickets" (
    "registration_id",
    "event_id",
    "user_id",
    "ticket_code",
    "token_hash",
    "sealed_token",
    "status",
    "released_at"
  )
  SELECT
    r."id",
    r."event_id",
    r."user_id",
    'TCK-' || UPPER(LEFT(REPLACE(r."id"::text, '-', ''), 10)),
    CASE WHEN r."status" = 'attended' THEN r."qr_token_hash" ELSE NULL END,
    NULL,
    CASE
      WHEN r."status" = 'attended' THEN 'released'
      WHEN r."status" = 'cancelled' THEN 'revoked'
      ELSE 'not_released'
    END,
    CASE WHEN r."status" = 'attended' THEN COALESCE(r."submitted_at", NOW()) ELSE NULL END
  FROM "public"."registrations" r
  WHERE NOT EXISTS (
    SELECT 1 FROM "public"."tickets" t WHERE t."registration_id" = r."id"
  );

  UPDATE "public"."registrations"
  SET
    "qr_token" = 'REG-' || UPPER(LEFT(REPLACE("id"::text, '-', ''), 12)),
    "qr_token_hash" = encode(sha256(("id"::text || ':regref')::bytea), 'hex')
  WHERE "qr_token" NOT LIKE 'REG-%';

  UPDATE "public"."finance_reports"
  SET
    "total_collections_minor_units" = ROUND("total_collections" * 100)::bigint,
    "total_expenses_minor_units" = ROUND("total_expenses" * 100)::bigint,
    "net_balance_minor_units" = ROUND("net_balance" * 100)::bigint
  WHERE "total_collections_minor_units" = 0
    AND "total_expenses_minor_units" = 0
    AND ("total_collections" <> 0 OR "total_expenses" <> 0);
END $$;
