CREATE TABLE "club_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"inviter_user_id" uuid,
	"invitee_email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"intended_role" text NOT NULL,
	"title" text DEFAULT 'Member' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery_mode" text DEFAULT 'test_adapter' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "chk_club_invitations_role" CHECK ("club_invitations"."intended_role" IN ('president', 'vice_president', 'core_member')),
	CONSTRAINT "chk_club_invitations_status" CHECK ("club_invitations"."status" IN ('pending', 'accepted', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "event_form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text DEFAULT 'Event Registration Form' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"schema_snapshot" jsonb NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_memberships" DROP CONSTRAINT "chk_club_memberships_role";--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "chk_events_status";--> statement-breakpoint
ALTER TABLE "form_fields" DROP CONSTRAINT "chk_form_fields_type";--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "manual_reason" text;--> statement-breakpoint
ALTER TABLE "event_forms" ADD COLUMN "published_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_forms" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "registration_opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "fee_minor_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "eligibility_rules" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "form_fields" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "form_fields" ADD COLUMN "validation_rules" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "form_version_id" uuid;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
SELECT set_config('app.current_global_role', 'system_seed', true);--> statement-breakpoint
WITH ranked_admins AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY club_id ORDER BY created_at ASC) AS rn
  FROM "club_memberships"
  WHERE "membership_role" = 'club_admin' AND "status" = 'active'
)
UPDATE "club_memberships" cm
SET "membership_role" = CASE
  WHEN ra.rn = 1 THEN 'president'
  WHEN ra.rn = 2 THEN 'vice_president'
  ELSE 'core_member'
END
FROM ranked_admins ra
WHERE cm.id = ra.id;--> statement-breakpoint
UPDATE "club_memberships"
SET "membership_role" = 'core_member'
WHERE "membership_role" = 'club_admin';--> statement-breakpoint
UPDATE "events"
SET "fee_minor_units" = ROUND("fee_amount" * 100)::integer
WHERE "fee_amount" > 0 AND "fee_minor_units" = 0;--> statement-breakpoint
UPDATE "event_forms" ef
SET "status" = 'published', "published_version" = ef."version"
FROM "events" e
WHERE e."id" = ef."event_id"
  AND e."status" IN ('published', 'registration_open', 'registration_closed', 'completed')
  AND ef."published_version" = 0;--> statement-breakpoint
INSERT INTO "event_form_versions" ("form_id", "event_id", "version", "title", "description", "schema_snapshot")
SELECT
  ef."id",
  ef."event_id",
  ef."version",
  ef."title",
  COALESCE(ef."description", ''),
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ff."field_key",
          'label', ff."label",
          'description', COALESCE(ff."description", ''),
          'type', ff."field_type",
          'required', ff."required",
          'placeholder', ff."placeholder",
          'options', ff."options",
          'validationRules', ff."validation_rules"
        )
        ORDER BY ff."sort_order" ASC
      )
      FROM "form_fields" ff
      WHERE ff."form_id" = ef."id"
    ),
    '[]'::jsonb
  )
FROM "event_forms" ef
WHERE ef."status" = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM "event_form_versions" efv
    WHERE efv."event_id" = ef."event_id" AND efv."version" = ef."version"
  );--> statement-breakpoint
UPDATE "registrations" r
SET "form_version_id" = efv."id"
FROM "event_form_versions" efv
WHERE r."event_id" = efv."event_id"
  AND r."form_version" = efv."version"
  AND r."form_version_id" IS NULL;--> statement-breakpoint
ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_form_versions" ADD CONSTRAINT "event_form_versions_form_id_event_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."event_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_form_versions" ADD CONSTRAINT "event_form_versions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_form_versions" ADD CONSTRAINT "event_form_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_club_invitations_club_status" ON "club_invitations" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "idx_club_invitations_email_status" ON "club_invitations" USING btree ("normalized_email","status");--> statement-breakpoint
CREATE INDEX "idx_club_invitations_expires_at" ON "club_invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_event_form_versions_event_version" ON "event_form_versions" USING btree ("event_id","version");--> statement-breakpoint
CREATE INDEX "idx_event_form_versions_form" ON "event_form_versions" USING btree ("form_id");--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_form_version_id_event_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."event_form_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attendance_records_event_scanned" ON "attendance_records" USING btree ("event_id","scanned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_club_memberships_active_president" ON "club_memberships" USING btree ("club_id") WHERE "club_memberships"."membership_role" = 'president' AND "club_memberships"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_club_memberships_active_vp" ON "club_memberships" USING btree ("club_id") WHERE "club_memberships"."membership_role" = 'vice_president' AND "club_memberships"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_club_memberships_club_role_status" ON "club_memberships" USING btree ("club_id","membership_role","status");--> statement-breakpoint
CREATE INDEX "idx_events_status_starts" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "idx_events_club_status_starts" ON "events" USING btree ("club_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "idx_form_fields_form_order" ON "form_fields" USING btree ("form_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_registrations_event_status_submitted" ON "registrations" USING btree ("event_id","status","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_registrations_user_submitted" ON "registrations" USING btree ("user_id","submitted_at");--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "chk_club_memberships_role" CHECK ("club_memberships"."membership_role" IN ('president', 'vice_president', 'core_member'));--> statement-breakpoint
ALTER TABLE "event_forms" ADD CONSTRAINT "chk_event_forms_status" CHECK ("event_forms"."status" IN ('draft', 'published'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "chk_events_fee_minor_units" CHECK ("events"."fee_minor_units" >= 0);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "chk_events_status" CHECK ("events"."status" IN ('draft', 'published', 'registration_open', 'registration_closed', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "chk_form_fields_type" CHECK ("form_fields"."field_type" IN ('text', 'textarea', 'email', 'phone', 'number', 'select', 'radio', 'checkboxes', 'checkbox', 'url'));