ALTER TABLE "play_sessions" ALTER COLUMN "win_points_snapshot" SET DATA TYPE numeric(12, 1);--> statement-breakpoint
ALTER TABLE "play_sessions" ALTER COLUMN "loss_points_snapshot" SET DATA TYPE numeric(12, 1);--> statement-breakpoint
ALTER TABLE "point_ledger" ALTER COLUMN "points" SET DATA TYPE numeric(12, 1);--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "win_points" SET DATA TYPE numeric(12, 1);--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "win_points" SET DEFAULT 150;--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "loss_points" SET DATA TYPE numeric(12, 1);--> statement-breakpoint
ALTER TABLE "seasons" ALTER COLUMN "loss_points" SET DEFAULT 30;