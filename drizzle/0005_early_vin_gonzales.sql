ALTER TYPE "public"."ledger_reason" ADD VALUE 'placement_bonus' BEFORE 'manual_adjustment';--> statement-breakpoint
ALTER TYPE "public"."ledger_reason" ADD VALUE 'session_cap_adjustment' BEFORE 'manual_adjustment';--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "win_points" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "loss_points" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD COLUMN "first_place_bonus_snapshot" numeric(12, 1) DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD COLUMN "second_place_bonus_snapshot" numeric(12, 1) DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD COLUMN "third_place_bonus_snapshot" numeric(12, 1) DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD COLUMN "max_session_points_snapshot" numeric(12, 1) DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "first_place_bonus" numeric(12, 1) DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "second_place_bonus" numeric(12, 1) DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "third_place_bonus" numeric(12, 1) DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "max_session_points" numeric(12, 1) DEFAULT 8 NOT NULL;--> statement-breakpoint
-- Season scoring rules are mutable configuration, so normalize active and archived seasons alike.
UPDATE "seasons"
SET "win_points" = 1,
  "loss_points" = 0,
  "first_place_bonus" = 4,
  "second_place_bonus" = 2,
  "third_place_bonus" = 1,
  "max_session_points" = 8;--> statement-breakpoint
-- Unfinalized sessions adopt the new standard rules because they have not produced ledger history yet.
UPDATE "play_sessions"
SET "win_points_snapshot" = 1,
  "loss_points_snapshot" = 0,
  "first_place_bonus_snapshot" = 4,
  "second_place_bonus_snapshot" = 2,
  "third_place_bonus_snapshot" = 1,
  "max_session_points_snapshot" = 8
WHERE "status" IN ('draft', 'draw_published', 'in_progress');--> statement-breakpoint
-- Finalized and voided sessions retain their legacy win/loss snapshots; zero bonuses and an effectively
-- uncapped numeric(12,1) maximum preserve their historical scoring semantics for audits and replacements.
UPDATE "play_sessions"
SET "first_place_bonus_snapshot" = 0,
  "second_place_bonus_snapshot" = 0,
  "third_place_bonus_snapshot" = 0,
  "max_session_points_snapshot" = 99999999999.9
WHERE "status" IN ('finalized', 'voided');--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_first_place_bonus_nonnegative" CHECK ("play_sessions"."first_place_bonus_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_second_place_bonus_nonnegative" CHECK ("play_sessions"."second_place_bonus_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_third_place_bonus_nonnegative" CHECK ("play_sessions"."third_place_bonus_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_max_session_points_positive" CHECK ("play_sessions"."max_session_points_snapshot" > 0);--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_first_place_bonus_nonnegative" CHECK ("seasons"."first_place_bonus" >= 0);--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_second_place_bonus_nonnegative" CHECK ("seasons"."second_place_bonus" >= 0);--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_third_place_bonus_nonnegative" CHECK ("seasons"."third_place_bonus" >= 0);--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_max_session_points_positive" CHECK ("seasons"."max_session_points" > 0);
