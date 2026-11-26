-- Reconcile schema drift in databases created before the Phase 4/Phase 5 migrations
-- were applied completely.

ALTER TABLE "clubs"
  DROP CONSTRAINT IF EXISTS "chk_clubs_status";

ALTER TABLE "clubs"
  ADD CONSTRAINT "chk_clubs_status"
  CHECK ("status" IN ('pending', 'pending_review', 'active', 'inactive', 'suspended'));

ALTER TABLE "club_invitations"
  ADD COLUMN IF NOT EXISTS "normalized_email" text;

UPDATE "club_invitations"
SET "normalized_email" = lower(trim("invitee_email"))
WHERE "normalized_email" IS NULL OR btrim("normalized_email") = '';

ALTER TABLE "club_invitations"
  ALTER COLUMN "normalized_email" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_club_invitations_email_status"
  ON "club_invitations" ("normalized_email", "status");
