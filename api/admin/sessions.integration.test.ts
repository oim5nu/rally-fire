import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditLog,
  matches,
  players,
  playSessions,
  pointLedger,
  seasonRoster,
  seasons,
  sessionParticipants,
  teamMembers,
  teams,
} from '../../server/db/schema.js';
import * as schema from '../../server/db/schema.js';
import { finalizeSessionPoints, voidFinalizedSession } from './sessions.js';

export function validateLocalPostgresTestUrl(value: string): string {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase())) {
    throw new Error('POSTGRES_TEST_URL must point to localhost, 127.0.0.1, or [::1].');
  }
  if (!url.pathname || url.pathname === '/') {
    throw new Error('POSTGRES_TEST_URL must include a maintenance database name.');
  }
  return url.toString();
}

const configuredTestUrl = process.env.POSTGRES_TEST_URL;
const localTestUrl = configuredTestUrl ? validateLocalPostgresTestUrl(configuredTestUrl) : null;
const integrationDescribe = localTestUrl ? describe : describe.skip;

describe('POSTGRES_TEST_URL safety', () => {
  it('accepts only explicit local database hosts', () => {
    expect(validateLocalPostgresTestUrl('postgres://postgres:postgres@localhost:5432/postgres'))
      .toContain('localhost');
    expect(validateLocalPostgresTestUrl('postgres://postgres:postgres@[::1]:5432/postgres'))
      .toContain('[::1]');
    expect(() => validateLocalPostgresTestUrl('postgres://postgres:postgres@db.example.com/postgres'))
      .toThrow('must point to localhost');
    expect(() => validateLocalPostgresTestUrl('postgres://postgres:postgres@127.0.0.1:5432'))
      .toThrow('must include a maintenance database name');
  });
});

integrationDescribe('session point persistence transactions', () => {
  const databaseName = `rally_fire_test_${randomUUID().replaceAll('-', '')}`;
  const ids = Object.fromEntries([
    'actor', 'authUser', 'season', 'failedSeason', 'session', 'failedSession',
    'team1', 'team2', 'team3', 'failedTeam1', 'failedTeam2',
    'player1a', 'player1b', 'player2a', 'player2b', 'player3a', 'player3b',
    'match1', 'match2', 'match3', 'failedMatch',
    'legacyActiveSeason', 'legacyDraftSeason', 'legacyProgressSeason', 'legacyHistorySeason',
    'legacyDraftSession', 'legacyProgressSession', 'legacyFinalizedSession', 'legacyVoidedSession',
    'legacyPlayer', 'legacyLedgerWin', 'legacyLedgerLoss',
  ].map((name) => [name, randomUUID()])) as Record<string, string>;
  let maintenanceClient: ReturnType<typeof postgres>;
  let queryClient: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let migrationFixture: {
    seasons: Array<Record<string, unknown>>;
    sessions: Array<Record<string, unknown>>;
    ledgerBefore: Array<Record<string, unknown>>;
    ledgerAfter: Array<Record<string, unknown>>;
    totalBefore: string;
    totalAfter: string;
  };

  beforeAll(async () => {
    maintenanceClient = postgres(localTestUrl!, { max: 1, prepare: false });
    await maintenanceClient.unsafe(`CREATE DATABASE "${databaseName}"`);

    const databaseUrl = new URL(localTestUrl!);
    databaseUrl.pathname = `/${databaseName}`;
    queryClient = postgres(databaseUrl.toString(), { max: 5, prepare: false });
    await queryClient.unsafe('CREATE SCHEMA auth');
    await queryClient.unsafe('CREATE TABLE auth.users (id uuid PRIMARY KEY)');
    database = drizzle(queryClient, { schema });
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
    const applyMigrations = async (selectedMigrations: typeof migrations) => {
      for (const migration of selectedMigrations) {
        await database.transaction(async (transaction) => {
          for (const statement of migration.sql) {
            if (statement.trim()) await transaction.execute(sql.raw(statement));
          }
        });
      }
    };
    await applyMigrations(migrations.slice(0, 5));

    await queryClient`INSERT INTO auth.users (id) VALUES (${ids.authUser})`;
    await queryClient`
      INSERT INTO admin_memberships (id, auth_user_id, email, role)
      VALUES (${ids.actor}, ${ids.authUser}, 'integration-admin@example.test', 'superadmin')
    `;
    await queryClient`
      INSERT INTO seasons (id, name, status, starts_at, win_points, loss_points, created_by)
      VALUES
        (${ids.legacyActiveSeason}, 'Legacy active', 'active', '2024-01-01T00:00:00Z', 150, 30, ${ids.actor}),
        (${ids.legacyDraftSeason}, 'Legacy draft owner', 'archived', '2023-01-01T00:00:00Z', 150, 30, ${ids.actor}),
        (${ids.legacyProgressSeason}, 'Legacy progress owner', 'archived', '2022-01-01T00:00:00Z', 150, 30, ${ids.actor}),
        (${ids.legacyHistorySeason}, 'Legacy history owner', 'archived', '2021-01-01T00:00:00Z', 150, 30, ${ids.actor})
    `;
    await queryClient`
      INSERT INTO players (id, name, display_rating, club_skill)
      VALUES (${ids.legacyPlayer}, 'Legacy player', '1000', 5)
    `;
    await queryClient`
      INSERT INTO play_sessions
        (id, season_id, name, format, scheduled_at, status, win_points_snapshot, loss_points_snapshot, created_by)
      VALUES
        (${ids.legacyDraftSession}, ${ids.legacyDraftSeason}, 'Legacy draft', 'round_robin', '2023-02-01T00:00:00Z', 'draft', 150, 30, ${ids.actor}),
        (${ids.legacyProgressSession}, ${ids.legacyProgressSeason}, 'Legacy progress', 'round_robin', '2022-02-01T00:00:00Z', 'in_progress', 150, 30, ${ids.actor}),
        (${ids.legacyFinalizedSession}, ${ids.legacyHistorySeason}, 'Legacy finalized', 'round_robin', '2021-02-01T00:00:00Z', 'finalized', 150, 30, ${ids.actor}),
        (${ids.legacyVoidedSession}, ${ids.legacyHistorySeason}, 'Legacy voided', 'round_robin', '2021-03-01T00:00:00Z', 'voided', 150, 30, ${ids.actor})
    `;
    await queryClient`
      INSERT INTO point_ledger
        (id, season_id, player_id, session_id, points, reason, idempotency_key, created_by)
      VALUES
        (${ids.legacyLedgerWin}, ${ids.legacyHistorySeason}, ${ids.legacyPlayer}, ${ids.legacyFinalizedSession}, 150, 'match_win', 'legacy:win', ${ids.actor}),
        (${ids.legacyLedgerLoss}, ${ids.legacyHistorySeason}, ${ids.legacyPlayer}, ${ids.legacyFinalizedSession}, 30, 'match_loss', 'legacy:loss', ${ids.actor})
    `;
    const ledgerBefore = await queryClient`
      SELECT id, points::text AS points, reason::text AS reason, idempotency_key
      FROM point_ledger ORDER BY id
    `;
    const [totalBefore] = await queryClient`
      SELECT sum(points)::text AS total FROM point_ledger WHERE player_id = ${ids.legacyPlayer}
    `;

    await applyMigrations(migrations.slice(5, 6));

    const migratedSeasons = await queryClient`
      SELECT id, win_points::text AS win_points, loss_points::text AS loss_points,
        first_place_bonus::text AS first_place_bonus, second_place_bonus::text AS second_place_bonus,
        third_place_bonus::text AS third_place_bonus, max_session_points::text AS max_session_points
      FROM seasons WHERE id IN (
        ${ids.legacyActiveSeason}, ${ids.legacyDraftSeason},
        ${ids.legacyProgressSeason}, ${ids.legacyHistorySeason}
      ) ORDER BY id
    `;
    const migratedSessions = await queryClient`
      SELECT id, status::text AS status, win_points_snapshot::text AS win_points_snapshot,
        loss_points_snapshot::text AS loss_points_snapshot,
        first_place_bonus_snapshot::text AS first_place_bonus_snapshot,
        second_place_bonus_snapshot::text AS second_place_bonus_snapshot,
        third_place_bonus_snapshot::text AS third_place_bonus_snapshot,
        max_session_points_snapshot::text AS max_session_points_snapshot
      FROM play_sessions WHERE id IN (
        ${ids.legacyDraftSession}, ${ids.legacyProgressSession},
        ${ids.legacyFinalizedSession}, ${ids.legacyVoidedSession}
      ) ORDER BY id
    `;
    const ledgerAfter = await queryClient`
      SELECT id, points::text AS points, reason::text AS reason, idempotency_key
      FROM point_ledger ORDER BY id
    `;
    const [totalAfter] = await queryClient`
      SELECT sum(points)::text AS total FROM point_ledger WHERE player_id = ${ids.legacyPlayer}
    `;
    migrationFixture = {
      seasons: [...migratedSeasons],
      sessions: [...migratedSessions],
      ledgerBefore: [...ledgerBefore],
      ledgerAfter: [...ledgerAfter],
      totalBefore: totalBefore.total,
      totalAfter: totalAfter.total,
    };

    await queryClient`UPDATE seasons SET status = 'archived' WHERE id = ${ids.legacyActiveSeason}`;

    for (const migration of migrations.slice(6)) {
      await database.transaction(async (transaction) => {
        for (const statement of migration.sql) {
          if (statement.trim()) await transaction.execute(sql.raw(statement));
        }
      });
    }

    await database.insert(seasons).values([
      {
        id: ids.season,
        name: 'Integration season',
        status: 'active',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        winPoints: 1,
        lossPoints: 0,
        firstPlaceBonus: 4,
        secondPlaceBonus: 2,
        thirdPlaceBonus: 1,
        maxSessionPoints: 5,
        createdBy: ids.actor,
      },
      {
        id: ids.failedSeason,
        name: 'Rollback season',
        status: 'archived',
        startsAt: new Date('2025-01-01T00:00:00Z'),
        createdBy: ids.actor,
      },
    ]);
    const playerIds = [
      ids.player1a, ids.player1b, ids.player2a,
      ids.player2b, ids.player3a, ids.player3b,
    ];
    await database.insert(players).values(playerIds.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      displayRating: '1000',
      clubSkill: 5,
    })));
    await database.insert(seasonRoster).values([
      ...playerIds.map((playerId) => ({ seasonId: ids.season, playerId })),
      ...playerIds.slice(0, 4).map((playerId) => ({ seasonId: ids.failedSeason, playerId })),
    ]);
    await database.insert(playSessions).values([
      {
        id: ids.session,
        seasonId: ids.season,
        name: 'Completed round robin',
        format: 'round_robin',
        scheduledAt: new Date('2026-02-01T00:00:00Z'),
        status: 'in_progress',
        winPointsSnapshot: 1,
        lossPointsSnapshot: 0,
        firstPlaceBonusSnapshot: 4,
        secondPlaceBonusSnapshot: 2,
        thirdPlaceBonusSnapshot: 1,
        maxSessionPointsSnapshot: 5,
        createdBy: ids.actor,
      },
      {
        id: ids.failedSession,
        seasonId: ids.failedSeason,
        name: 'Incomplete round robin',
        format: 'round_robin',
        scheduledAt: new Date('2025-02-01T00:00:00Z'),
        status: 'in_progress',
        winPointsSnapshot: 1,
        lossPointsSnapshot: 0,
        firstPlaceBonusSnapshot: 4,
        secondPlaceBonusSnapshot: 2,
        thirdPlaceBonusSnapshot: 1,
        maxSessionPointsSnapshot: 5,
        createdBy: ids.actor,
      },
    ]);
    await database.insert(sessionParticipants).values(playerIds.map((playerId) => ({
      sessionId: ids.session,
      playerId,
      status: 'attendee' as const,
    })));
    await database.insert(teams).values([
      { id: ids.team1, sessionId: ids.session, seed: 1 },
      { id: ids.team2, sessionId: ids.session, seed: 2 },
      { id: ids.team3, sessionId: ids.session, seed: 3 },
      { id: ids.failedTeam1, sessionId: ids.failedSession, seed: 1 },
      { id: ids.failedTeam2, sessionId: ids.failedSession, seed: 2 },
    ]);
    await database.insert(teamMembers).values([
      { teamId: ids.team1, sessionId: ids.session, playerId: ids.player1a, group: 'A' },
      { teamId: ids.team1, sessionId: ids.session, playerId: ids.player1b, group: 'B' },
      { teamId: ids.team2, sessionId: ids.session, playerId: ids.player2a, group: 'A' },
      { teamId: ids.team2, sessionId: ids.session, playerId: ids.player2b, group: 'B' },
      { teamId: ids.team3, sessionId: ids.session, playerId: ids.player3a, group: 'A' },
      { teamId: ids.team3, sessionId: ids.session, playerId: ids.player3b, group: 'B' },
      { teamId: ids.failedTeam1, sessionId: ids.failedSession, playerId: ids.player1a, group: 'A' },
      { teamId: ids.failedTeam1, sessionId: ids.failedSession, playerId: ids.player1b, group: 'B' },
      { teamId: ids.failedTeam2, sessionId: ids.failedSession, playerId: ids.player2a, group: 'A' },
      { teamId: ids.failedTeam2, sessionId: ids.failedSession, playerId: ids.player2b, group: 'B' },
    ]);
    await database.insert(matches).values([
      {
        id: ids.match1, sessionId: ids.session, sequence: 1,
        teamAId: ids.team1, teamBId: ids.team2, scoreA: 11, scoreB: 7, status: 'completed',
      },
      {
        id: ids.match2, sessionId: ids.session, sequence: 2,
        teamAId: ids.team1, teamBId: ids.team3, scoreA: 11, scoreB: 5, status: 'completed',
      },
      {
        id: ids.match3, sessionId: ids.session, sequence: 3,
        teamAId: ids.team2, teamBId: ids.team3, scoreA: 11, scoreB: 9, status: 'completed',
      },
      {
        id: ids.failedMatch, sessionId: ids.failedSession, sequence: 1,
        teamAId: ids.failedTeam1, teamBId: ids.failedTeam2, status: 'pending',
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (queryClient) await queryClient.end({ timeout: 5 });
    if (maintenanceClient) {
      await maintenanceClient.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await maintenanceClient.end({ timeout: 5 });
    }
  }, 60_000);

  it('migrates real 0000-0004 legacy rows with status-sensitive snapshots and unchanged ledger history', () => {
    expect(migrationFixture.seasons).toHaveLength(4);
    expect(migrationFixture.seasons.every((season) =>
      season.win_points === '1.0'
      && season.loss_points === '0.0'
      && season.first_place_bonus === '4.0'
      && season.second_place_bonus === '2.0'
      && season.third_place_bonus === '1.0'
      && season.max_session_points === '8.0')).toBe(true);

    const sessionsByStatus = new Map(migrationFixture.sessions.map((session) => [session.status, session]));
    for (const status of ['draft', 'in_progress']) {
      expect(sessionsByStatus.get(status)).toMatchObject({
        win_points_snapshot: '1.0',
        loss_points_snapshot: '0.0',
        first_place_bonus_snapshot: '4.0',
        second_place_bonus_snapshot: '2.0',
        third_place_bonus_snapshot: '1.0',
        max_session_points_snapshot: '8.0',
      });
    }
    for (const status of ['finalized', 'voided']) {
      expect(sessionsByStatus.get(status)).toMatchObject({
        win_points_snapshot: '150.0',
        loss_points_snapshot: '30.0',
        first_place_bonus_snapshot: '0.0',
        second_place_bonus_snapshot: '0.0',
        third_place_bonus_snapshot: '0.0',
        max_session_points_snapshot: '99999999999.9',
      });
    }
    expect(migrationFixture.ledgerAfter).toEqual(migrationFixture.ledgerBefore);
    expect(migrationFixture.totalAfter).toBe(migrationFixture.totalBefore);
    expect(migrationFixture.totalAfter).toBe('180.0');
  });

  it('rolls back incomplete finalization without ledger or status changes', async () => {
    await expect(finalizeSessionPoints(database, ids.failedSession, ids.actor)).resolves.toEqual({
      error: 'all_matches_must_be_completed',
    });
    const [session] = await database.select().from(playSessions)
      .where(eq(playSessions.id, ids.failedSession));
    const ledger = await database.select().from(pointLedger)
      .where(eq(pointLedger.sessionId, ids.failedSession));
    expect(session.status).toBe('in_progress');
    expect(ledger).toEqual([]);
  });

  it('finalizes once under concurrency, persists configured awards, then voids them once', async () => {
    const attempts = await Promise.allSettled([
      finalizeSessionPoints(database, ids.session, ids.actor),
      finalizeSessionPoints(database, ids.session, ids.actor),
    ]);
    expect(attempts.every((attempt) => attempt.status === 'fulfilled')).toBe(true);
    const results = attempts.map((attempt) => {
      if (attempt.status !== 'fulfilled') throw attempt.reason;
      return attempt.value;
    });
    expect(results).toContainEqual({ sessionId: ids.session });
    expect(results).toContainEqual({ error: 'finalizable_session_required' });

    const [finalized] = await database.select().from(playSessions)
      .where(eq(playSessions.id, ids.session));
    expect(finalized.status).toBe('finalized');
    expect(finalized.finalizedAt).toBeInstanceOf(Date);

    const automaticEntries = await database.select().from(pointLedger).where(and(
      eq(pointLedger.sessionId, ids.session),
      inArray(pointLedger.reason, [
        'match_win', 'match_loss', 'placement_bonus', 'session_cap_adjustment',
      ]),
    ));
    expect(automaticEntries).toHaveLength(20);
    expect(new Set(automaticEntries.map((entry) => entry.reason))).toEqual(new Set([
      'match_win', 'match_loss', 'placement_bonus', 'session_cap_adjustment',
    ]));
    expect(new Set(automaticEntries.map((entry) => entry.idempotencyKey)).size)
      .toBe(automaticEntries.length);
    for (const entry of automaticEntries) {
      const awardSource = entry.matchId
        ?? (entry.reason === 'placement_bonus' ? 'placement' : 'cap');
      expect(entry.idempotencyKey).toBe(
        `award:${ids.session}:${awardSource}:${entry.playerId}`,
      );
    }
    const capEntries = automaticEntries.filter((entry) => entry.reason === 'session_cap_adjustment');
    expect(capEntries).toHaveLength(2);
    expect(capEntries.every((entry) => entry.points === -1)).toBe(true);

    const [finalizedAudit] = await database.select().from(auditLog).where(and(
      eq(auditLog.entityId, ids.session),
      eq(auditLog.action, 'session.finalized'),
    ));
    expect(finalizedAudit.actorMembershipId).toBe(ids.actor);
    expect(finalizedAudit.details).toMatchObject({
      matchCount: 3,
      rules: {
        winPoints: 1,
        lossPoints: 0,
        firstPlaceBonus: 4,
        secondPlaceBonus: 2,
        thirdPlaceBonus: 1,
        maxSessionPoints: 5,
      },
      teams: expect.arrayContaining([
        { teamId: ids.team1, placement: 1, rawPoints: 6, cappedPoints: 5, capAdjustment: -1 },
        { teamId: ids.team2, placement: 2, rawPoints: 3, cappedPoints: 3, capAdjustment: 0 },
        { teamId: ids.team3, placement: 3, rawPoints: 1, cappedPoints: 1, capAdjustment: 0 },
      ]),
    });

    const voidInput = {
      sessionId: ids.session,
      reason: 'Integration test reversal',
      createReplacement: true,
    };
    const voidAttempts = await Promise.allSettled([
      voidFinalizedSession(database, voidInput, ids.actor),
      voidFinalizedSession(database, voidInput, ids.actor),
    ]);
    expect(voidAttempts.every((attempt) => attempt.status === 'fulfilled')).toBe(true);
    const voidResults = voidAttempts.map((attempt) => {
      if (attempt.status !== 'fulfilled') throw attempt.reason;
      return attempt.value;
    });
    const voided = voidResults.find((result) => 'sessionId' in result)!;
    expect(voidResults).toContainEqual({ error: 'finalized_session_required' });
    expect(voided).toEqual({ sessionId: ids.session, replacementId: expect.any(String) });
    const replacements = await database.select().from(playSessions)
      .where(eq(playSessions.replacementForSessionId, ids.session));
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      id: voided.replacementId,
      winPointsSnapshot: 1,
      lossPointsSnapshot: 0,
      firstPlaceBonusSnapshot: 4,
      secondPlaceBonusSnapshot: 2,
      thirdPlaceBonusSnapshot: 1,
      maxSessionPointsSnapshot: 5,
    });
    const [voidAudit] = await database.select().from(auditLog).where(and(
      eq(auditLog.entityId, ids.session),
      eq(auditLog.action, 'session.voided'),
    ));
    expect(voidAudit).toMatchObject({
      actorMembershipId: ids.actor,
      details: { reason: voidInput.reason, replacementId: voided.replacementId },
    });

    const reversals = await database.select().from(pointLedger)
      .where(and(eq(pointLedger.sessionId, ids.session), eq(pointLedger.reason, 'session_void')));
    expect(reversals).toHaveLength(automaticEntries.length);
    expect(new Set(reversals.map((entry) => entry.reversesEntryId))).toEqual(
      new Set(automaticEntries.map((entry) => entry.id)),
    );
    const originalsById = new Map(automaticEntries.map((entry) => [entry.id, entry]));
    for (const reversal of reversals) {
      expect(reversal.points + originalsById.get(reversal.reversesEntryId!)!.points).toBe(0);
      expect(reversal.idempotencyKey).toBe(`void:${ids.session}:${reversal.reversesEntryId}`);
    }
    expect(reversals.filter((entry) => entry.points === 1)).toHaveLength(2);

    const reversalsAfterSecondVoid = await database.select().from(pointLedger)
      .where(and(eq(pointLedger.sessionId, ids.session), eq(pointLedger.reason, 'session_void')));
    expect(reversalsAfterSecondVoid).toHaveLength(automaticEntries.length);
  }, 30_000);
});
