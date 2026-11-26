ALTER TABLE "clubs" DROP CONSTRAINT "chk_clubs_status";--> statement-breakpoint
CREATE INDEX "idx_clubs_status_followers" ON "clubs" USING btree ("status","follower_count");--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "chk_clubs_status" CHECK ("clubs"."status" IN ('pending', 'pending_review', 'active', 'inactive', 'suspended'));