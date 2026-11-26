CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"scanned_by" uuid,
	"scanned_by_name" text DEFAULT 'Club Officer' NOT NULL,
	"scan_method" text NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_registration_id_unique" UNIQUE("registration_id"),
	CONSTRAINT "chk_attendance_scan_method" CHECK ("attendance_records"."scan_method" IN ('qr_scan', 'manual_override', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text DEFAULT 'System' NOT NULL,
	"actor_context" text DEFAULT 'System' NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_label" text DEFAULT '' NOT NULL,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "club_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"membership_role" text NOT NULL,
	"title" text DEFAULT 'Officer' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_club_memberships_role" CHECK ("club_memberships"."membership_role" IN ('club_admin', 'core_member')),
	CONSTRAINT "chk_club_memberships_status" CHECK ("club_memberships"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text NOT NULL,
	"logo_url" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"founded_year" integer DEFAULT 2024 NOT NULL,
	"meeting_schedule" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_name_unique" UNIQUE("name"),
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "chk_clubs_status" CHECK ("clubs"."status" IN ('pending', 'pending_review', 'active', 'suspended')),
	CONSTRAINT "chk_clubs_follower_count" CHECK ("clubs"."follower_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text DEFAULT 'Event Registration Form' NOT NULL,
	"description" text DEFAULT '',
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_forms_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "event_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"highlights" text NOT NULL,
	"challenges" text DEFAULT 'None reported' NOT NULL,
	"actual_attendance" integer NOT NULL,
	"registered_total" integer DEFAULT 0 NOT NULL,
	"completion_status" text DEFAULT 'completed' NOT NULL,
	"submitted_by" uuid,
	"submitted_by_name" text DEFAULT 'Club Officer' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_reports_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "chk_event_reports_attendance" CHECK ("event_reports"."actual_attendance" >= 0),
	CONSTRAINT "chk_event_reports_completion_status" CHECK ("event_reports"."completion_status" IN ('completed', 'partial'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"venue" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"registration_deadline" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"registered_count" integer DEFAULT 0 NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"fee_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"banner_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_events_status" CHECK ("events"."status" IN ('draft', 'published', 'completed', 'cancelled')),
	CONSTRAINT "chk_events_capacity" CHECK ("events"."capacity" > 0),
	CONSTRAINT "chk_events_registered_count" CHECK ("events"."registered_count" >= 0),
	CONSTRAINT "chk_events_fee_amount" CHECK ("events"."fee_amount" >= 0),
	CONSTRAINT "chk_events_dates" CHECK ("events"."ends_at" > "events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "finance_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finance_report_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"notes" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_finance_line_items_type" CHECK ("finance_line_items"."item_type" IN ('collection', 'expense', 'adjustment')),
	CONSTRAINT "chk_finance_line_items_amount" CHECK ("finance_line_items"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"total_collections" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_expenses" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"net_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"submitted_by" uuid,
	"submitted_by_name" text DEFAULT 'Club Officer' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_reports_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"placeholder" text,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chk_form_fields_type" CHECK ("form_fields"."field_type" IN ('text', 'textarea', 'number', 'select', 'checkbox', 'email', 'phone'))
);
--> statement-breakpoint
CREATE TABLE "hall_of_fame_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"follower_count" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"form_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"qr_token" text NOT NULL,
	"qr_token_hash" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "registrations_qr_token_hash_unique" UNIQUE("qr_token_hash"),
	CONSTRAINT "chk_registrations_status" CHECK ("registrations"."status" IN ('confirmed', 'waitlisted', 'cancelled', 'attended'))
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"display_name" text NOT NULL,
	"department" text DEFAULT 'Computer Science & Engineering' NOT NULL,
	"year_of_study" text DEFAULT 'Undergraduate' NOT NULL,
	"student_id" text,
	"avatar_url" text,
	"global_role" text DEFAULT 'user' NOT NULL,
	"account_status" text DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_normalized_email_unique" UNIQUE("normalized_email"),
	CONSTRAINT "users_student_id_unique" UNIQUE("student_id"),
	CONSTRAINT "chk_users_global_role" CHECK ("users"."global_role" IN ('user', 'super_admin')),
	CONSTRAINT "chk_users_account_status" CHECK ("users"."account_status" IN ('active', 'suspended', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_follows" ADD CONSTRAINT "club_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_follows" ADD CONSTRAINT "club_follows_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_forms" ADD CONSTRAINT "event_forms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_forms" ADD CONSTRAINT "event_forms_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_line_items" ADD CONSTRAINT "finance_line_items_finance_report_id_finance_reports_id_fk" FOREIGN KEY ("finance_report_id") REFERENCES "public"."finance_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_reports" ADD CONSTRAINT "finance_reports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_reports" ADD CONSTRAINT "finance_reports_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_reports" ADD CONSTRAINT "finance_reports_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_id_event_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."event_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_of_fame_snapshots" ADD CONSTRAINT "hall_of_fame_snapshots_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attendance_records_event" ON "attendance_records" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_user_seen" ON "auth_sessions" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_club_follows_user_club" ON "club_follows" USING btree ("user_id","club_id");--> statement-breakpoint
CREATE INDEX "idx_club_follows_user" ON "club_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_club_follows_club" ON "club_follows" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_club_memberships_user_club" ON "club_memberships" USING btree ("user_id","club_id");--> statement-breakpoint
CREATE INDEX "idx_club_memberships_user" ON "club_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_club_memberships_club" ON "club_memberships" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "idx_clubs_status_category" ON "clubs" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "idx_events_club_status" ON "events" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "idx_events_starts_at" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_finance_line_items_report" ON "finance_line_items" USING btree ("finance_report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_form_fields_form_key" ON "form_fields" USING btree ("form_id","field_key");--> statement-breakpoint
CREATE INDEX "idx_hof_snapshots_captured_rank" ON "hall_of_fame_snapshots" USING btree ("captured_at","rank");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read_created" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_registrations_event_user" ON "registrations" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_registrations_user" ON "registrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_registrations_qr_token" ON "registrations" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "idx_registrations_qr_token_hash" ON "registrations" USING btree ("qr_token_hash");--> statement-breakpoint
CREATE INDEX "idx_users_normalized_email" ON "users" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("account_status");