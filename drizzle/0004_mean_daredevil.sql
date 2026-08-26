CREATE TYPE "public"."match_kind" AS ENUM('round_robin', 'qualifier', 'championship', 'placement');--> statement-breakpoint
DROP INDEX "matches_session_bracket_position_unique";--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "match_kind" "match_kind" DEFAULT 'round_robin' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "placement_group" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "placement_best_rank" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "placement_worst_rank" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "loser_next_match_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "loser_to_slot" "winner_slot";--> statement-breakpoint
UPDATE "matches" AS "match"
SET "match_kind" = CASE
  WHEN "session"."format" = 'round_robin' THEN 'round_robin'::"match_kind"
  WHEN "match"."bracket_round" IS NOT NULL THEN 'championship'::"match_kind"
  WHEN "session"."format" = 'qualifying_knockout' AND "match"."sequence" <= 5 THEN 'qualifier'::"match_kind"
  ELSE 'placement'::"match_kind"
END,
"placement_group" = CASE WHEN "session"."format" = 'qualifying_knockout' AND "match"."bracket_round" IS NULL AND "match"."sequence" > 5 THEN 1 END,
"placement_best_rank" = CASE WHEN "session"."format" = 'qualifying_knockout' AND "match"."bracket_round" IS NULL AND "match"."sequence" > 5 THEN 9 END,
"placement_worst_rank" = CASE WHEN "session"."format" = 'qualifying_knockout' AND "match"."bracket_round" IS NULL AND "match"."sequence" > 5 THEN 10 END
FROM "play_sessions" AS "session"
WHERE "session"."id" = "match"."session_id";--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_loser_next_match_id_matches_id_fk" FOREIGN KEY ("loser_next_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_loser_next_match_idx" ON "matches" USING btree ("loser_next_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_session_bracket_position_unique" ON "matches" USING btree ("session_id","match_kind",coalesce("placement_group", 0),"bracket_round","bracket_position") WHERE "matches"."bracket_round" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_placement_metadata" CHECK (("matches"."match_kind" <> 'placement' AND "matches"."placement_group" IS NULL AND "matches"."placement_best_rank" IS NULL AND "matches"."placement_worst_rank" IS NULL) OR ("matches"."match_kind" = 'placement' AND "matches"."placement_group" IS NOT NULL AND "matches"."placement_best_rank" IS NOT NULL AND "matches"."placement_worst_rank" IS NOT NULL AND "matches"."placement_best_rank" < "matches"."placement_worst_rank"));
