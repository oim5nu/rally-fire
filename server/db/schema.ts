import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const adminRole = pgEnum('admin_role', ['superadmin', 'admin']);
export const membershipStatus = pgEnum('membership_status', ['active', 'disabled']);
export const seasonStatus = pgEnum('season_status', ['active', 'archived']);
export const participantStatus = pgEnum('participant_status', ['attendee', 'reserve']);
export const skillGroup = pgEnum('skill_group', ['A', 'B']);
export const playSessionStatus = pgEnum('play_session_status', [
  'draft',
  'draw_published',
  'in_progress',
  'finalized',
  'voided',
]);
export const matchStatus = pgEnum('match_status', ['pending', 'in_progress', 'completed']);
export const ledgerReason = pgEnum('ledger_reason', [
  'opening_balance',
  'match_win',
  'match_loss',
  'manual_adjustment',
  'session_void',
]);

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const adminMemberships = pgTable(
  'admin_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: uuid('auth_user_id').notNull(),
    email: text('email').notNull(),
    role: adminRole('role').notNull(),
    status: membershipStatus('status').notNull().default('active'),
    invitedBy: uuid('invited_by'),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('admin_memberships_auth_user_id_unique').on(table.authUserId),
    uniqueIndex('admin_memberships_email_lower_unique').on(sql`lower(${table.email})`),
    index('admin_memberships_status_role_idx').on(table.status, table.role),
  ],
).enableRLS();

export const adminSessionGrants = pgTable(
  'admin_session_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => adminMemberships.id, { onDelete: 'cascade' }),
    authSessionId: text('auth_session_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('admin_session_grants_auth_session_id_unique').on(table.authSessionId),
    index('admin_session_grants_membership_idx').on(table.membershipId),
  ],
).enableRLS();

export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: seasonStatus('status').notNull().default('active'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    winPoints: integer('win_points').notNull().default(150),
    lossPoints: integer('loss_points').notNull().default(30),
    createdBy: uuid('created_by').references(() => adminMemberships.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('seasons_one_active_unique').on(table.status).where(sql`${table.status} = 'active'`),
    check('seasons_win_points_nonnegative', sql`${table.winPoints} >= 0`),
    check('seasons_loss_points_nonnegative', sql`${table.lossPoints} >= 0`),
  ],
).enableRLS();

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email'),
    displayRating: text('display_rating').notNull(),
    clubSkill: integer('club_skill').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    check('players_club_skill_range', sql`${table.clubSkill} BETWEEN 1 AND 10`),
    index('players_active_name_idx').on(table.active, table.name),
  ],
).enableRLS();

export const seasonRoster = pgTable(
  'season_roster',
  {
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.seasonId, table.playerId] })],
).enableRLS();

export const playSessions = pgTable(
  'play_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: playSessionStatus('status').notNull().default('draft'),
    winPointsSnapshot: integer('win_points_snapshot').notNull(),
    lossPointsSnapshot: integer('loss_points_snapshot').notNull(),
    replacementForSessionId: uuid('replacement_for_session_id'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    createdBy: uuid('created_by').references(() => adminMemberships.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('play_sessions_one_active_per_season_unique')
      .on(table.seasonId)
      .where(sql`${table.status} IN ('draft', 'draw_published', 'in_progress')`),
    check('play_sessions_win_points_nonnegative', sql`${table.winPointsSnapshot} >= 0`),
    check('play_sessions_loss_points_nonnegative', sql`${table.lossPointsSnapshot} >= 0`),
    index('play_sessions_season_status_idx').on(table.seasonId, table.status),
  ],
).enableRLS();

export const sessionParticipants = pgTable(
  'session_participants',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => playSessions.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    status: participantStatus('status').notNull().default('attendee'),
    group: skillGroup('skill_group'),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.playerId] })],
).enableRLS();

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => playSessions.id, { onDelete: 'cascade' }),
    seed: integer('seed').notNull(),
    createdAt,
  },
  (table) => [uniqueIndex('teams_session_seed_unique').on(table.sessionId, table.seed)],
).enableRLS();

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => playSessions.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    group: skillGroup('skill_group').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.playerId] }),
    uniqueIndex('team_members_one_team_per_session_unique').on(table.sessionId, table.playerId),
    uniqueIndex('team_members_one_group_per_team_unique').on(table.teamId, table.group),
  ],
).enableRLS();

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => playSessions.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    teamAId: uuid('team_a_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    teamBId: uuid('team_b_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    court: text('court'),
    scoreA: integer('score_a'),
    scoreB: integer('score_b'),
    status: matchStatus('status').notNull().default('pending'),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex('matches_session_sequence_unique').on(table.sessionId, table.sequence),
    check('matches_different_teams', sql`${table.teamAId} <> ${table.teamBId}`),
    check(
      'matches_scores_range',
      sql`(${table.scoreA} IS NULL OR ${table.scoreA} BETWEEN 0 AND 99) AND (${table.scoreB} IS NULL OR ${table.scoreB} BETWEEN 0 AND 99)`,
    ),
  ],
).enableRLS();

export const pointLedger = pgTable(
  'point_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id').references(() => playSessions.id, { onDelete: 'restrict' }),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'restrict' }),
    points: integer('points').notNull(),
    reason: ledgerReason('reason').notNull(),
    reversesEntryId: uuid('reverses_entry_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => adminMemberships.id),
    createdAt,
  },
  (table) => [
    uniqueIndex('point_ledger_idempotency_key_unique').on(table.idempotencyKey),
    index('point_ledger_season_player_idx').on(table.seasonId, table.playerId),
    index('point_ledger_session_idx').on(table.sessionId),
  ],
).enableRLS();

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorMembershipId: uuid('actor_membership_id').references(() => adminMemberships.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt,
  },
  (table) => [index('audit_log_created_at_idx').on(table.createdAt)],
).enableRLS();
