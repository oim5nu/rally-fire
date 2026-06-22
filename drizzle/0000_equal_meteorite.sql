CREATE TYPE "public"."admin_role" AS ENUM('superadmin', 'admin');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('opening_balance', 'match_win', 'match_loss', 'manual_adjustment', 'session_void');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('attendee', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."play_session_status" AS ENUM('draft', 'draw_published', 'in_progress', 'finalized', 'voided');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."skill_group" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TABLE "admin_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admin_session_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"auth_session_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_session_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_membership_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"team_a_id" uuid NOT NULL,
	"team_b_id" uuid NOT NULL,
	"court" text,
	"score_a" integer,
	"score_b" integer,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_different_teams" CHECK ("matches"."team_a_id" <> "matches"."team_b_id"),
	CONSTRAINT "matches_scores_range" CHECK (("matches"."score_a" IS NULL OR "matches"."score_a" BETWEEN 0 AND 99) AND ("matches"."score_b" IS NULL OR "matches"."score_b" BETWEEN 0 AND 99))
);
--> statement-breakpoint
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "play_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "play_session_status" DEFAULT 'draft' NOT NULL,
	"win_points_snapshot" integer NOT NULL,
	"loss_points_snapshot" integer NOT NULL,
	"replacement_for_session_id" uuid,
	"finalized_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_sessions_win_points_nonnegative" CHECK ("play_sessions"."win_points_snapshot" >= 0),
	CONSTRAINT "play_sessions_loss_points_nonnegative" CHECK ("play_sessions"."loss_points_snapshot" >= 0)
);
--> statement-breakpoint
ALTER TABLE "play_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"display_rating" text NOT NULL,
	"club_skill" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_club_skill_range" CHECK ("players"."club_skill" BETWEEN 1 AND 10)
);
--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "point_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"session_id" uuid,
	"match_id" uuid,
	"points" integer NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"reverses_entry_id" uuid,
	"idempotency_key" text NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "point_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "season_roster" (
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_roster_season_id_player_id_pk" PRIMARY KEY("season_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "season_roster" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "season_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"win_points" integer DEFAULT 150 NOT NULL,
	"loss_points" integer DEFAULT 30 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_win_points_nonnegative" CHECK ("seasons"."win_points" >= 0),
	CONSTRAINT "seasons_loss_points_nonnegative" CHECK ("seasons"."loss_points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "seasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session_participants" (
	"session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" "participant_status" DEFAULT 'attendee' NOT NULL,
	"skill_group" "skill_group",
	CONSTRAINT "session_participants_session_id_player_id_pk" PRIMARY KEY("session_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "session_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"skill_group" "skill_group" NOT NULL,
	CONSTRAINT "team_members_team_id_player_id_pk" PRIMARY KEY("team_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"seed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_session_grants" ADD CONSTRAINT "admin_session_grants_membership_id_admin_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."admin_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_membership_id_admin_memberships_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."admin_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_session_id_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_a_id_teams_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_b_id_teams_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_created_by_admin_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_session_id_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."play_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_created_by_admin_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_roster" ADD CONSTRAINT "season_roster_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_roster" ADD CONSTRAINT "season_roster_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_admin_memberships_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_session_id_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_session_id_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_memberships_auth_user_id_unique" ON "admin_memberships" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_memberships_email_lower_unique" ON "admin_memberships" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "admin_memberships_status_role_idx" ON "admin_memberships" USING btree ("status","role");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_session_grants_auth_session_id_unique" ON "admin_session_grants" USING btree ("auth_session_id");--> statement-breakpoint
CREATE INDEX "admin_session_grants_membership_idx" ON "admin_session_grants" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_session_sequence_unique" ON "matches" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "play_sessions_one_active_per_season_unique" ON "play_sessions" USING btree ("season_id") WHERE "play_sessions"."status" IN ('draft', 'draw_published', 'in_progress');--> statement-breakpoint
CREATE INDEX "play_sessions_season_status_idx" ON "play_sessions" USING btree ("season_id","status");--> statement-breakpoint
CREATE INDEX "players_active_name_idx" ON "players" USING btree ("active","name");--> statement-breakpoint
CREATE UNIQUE INDEX "point_ledger_idempotency_key_unique" ON "point_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "point_ledger_season_player_idx" ON "point_ledger" USING btree ("season_id","player_id");--> statement-breakpoint
CREATE INDEX "point_ledger_session_idx" ON "point_ledger" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_unique" ON "seasons" USING btree ("status") WHERE "seasons"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_one_team_per_session_unique" ON "team_members" USING btree ("session_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_session_seed_unique" ON "teams" USING btree ("session_id","seed");--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_auth_user_id_auth_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_invited_by_admin_memberships_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_memberships"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "play_sessions" ADD CONSTRAINT "play_sessions_replacement_for_session_id_fk" FOREIGN KEY ("replacement_for_session_id") REFERENCES "public"."play_sessions"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_reverses_entry_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."point_ledger"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_completed_score_valid" CHECK (
	"status" <> 'completed' OR (
		"score_a" IS NOT NULL AND "score_b" IS NOT NULL AND "score_a" <> "score_b"
	)
);--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_one_group_per_team_unique" ON "team_members" USING btree ("team_id", "skill_group");
