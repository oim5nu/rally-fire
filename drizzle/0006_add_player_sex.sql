CREATE TYPE "public"."player_sex" AS ENUM('M', 'F', 'Unknown');--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "sex" "player_sex" DEFAULT 'Unknown' NOT NULL;