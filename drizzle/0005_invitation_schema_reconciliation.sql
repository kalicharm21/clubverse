-- Complete reconciliation for installations whose club_invitations table
-- predates the Phase 4 secure invitation schema.

ALTER TABLE "club_invitations"
  ADD COLUMN IF NOT EXISTS "normalized_email" text,
  ADD COLUMN IF NOT EXISTS "invitee_email" text,
  ADD COLUMN IF NOT EXISTS "intended_role" text,
  ADD COLUMN IF NOT EXISTS "title" text,
  ADD COLUMN IF NOT EXISTS "permissions" jsonb,
  ADD COLUMN IF NOT EXISTS "token_hash" text,
  ADD COLUMN IF NOT EXISTS "status" text,
  ADD COLUMN IF NOT EXISTS "delivery_mode" text,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "accepted_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "revoked_by" uuid,
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

UPDATE "club_invitations"
SET
  "invitee_email" = COALESCE("invitee_email", "normalized_email", ''),
  "normalized_email" = lower(trim(COALESCE("normalized_email", "invitee_email", ''))),
  "intended_role" = COALESCE("intended_role", 'core_member'),
  "title" = COALESCE("title", 'Member'),
  "permissions" = COALESCE("permissions", '[]'::jsonb),
  "status" = COALESCE("status", 'pending'),
  "delivery_mode" = COALESCE("delivery_mode", 'test_adapter'),
  "expires_at" = COALESCE("expires_at", now() + interval '72 hours'),
  "created_at" = COALESCE("created_at", now()),
  "updated_at" = COALESCE("updated_at", now());

UPDATE "club_invitations"
SET "token_hash" = encode(sha256(('legacy-invitation:' || "id"::text)::bytea), 'hex')
WHERE "token_hash" IS NULL;

ALTER TABLE "club_invitations"
  ALTER COLUMN "invitee_email" SET NOT NULL,
  ALTER COLUMN "normalized_email" SET NOT NULL,
  ALTER COLUMN "intended_role" SET NOT NULL,
  ALTER COLUMN "title" SET DEFAULT 'Member',
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "permissions" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "permissions" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "delivery_mode" SET DEFAULT 'test_adapter',
  ALTER COLUMN "delivery_mode" SET NOT NULL,
  ALTER COLUMN "expires_at" SET NOT NULL,
  ALTER COLUMN "token_hash" SET NOT NULL,
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;
