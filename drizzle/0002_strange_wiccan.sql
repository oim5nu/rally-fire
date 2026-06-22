CREATE TYPE "public"."session_format" AS ENUM('round_robin', 'knockout');--> statement-breakpoint
CREATE TYPE "public"."winner_slot" AS ENUM('A', 'B');--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "team_a_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "team_b_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "bracket_round" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "bracket_position" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "next_match_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "winner_to_slot" "winner_slot";--> statement-breakpoint
ALTER TABLE "play_sessions" ADD COLUMN "format" "session_format" DEFAULT 'round_robin' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_next_match_id_matches_id_fk" FOREIGN KEY ("next_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "matches_session_bracket_position_unique" ON "matches" USING btree ("session_id","bracket_round","bracket_position") WHERE "matches"."bracket_round" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "matches_next_match_idx" ON "matches" USING btree ("next_match_id");