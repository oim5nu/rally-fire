import { describe, expect, it } from 'vitest';
import {
  StageDrawStaleError,
  StageDrawUnavailableError,
  StageDrawValidationError,
} from '../../server/domain/stage-draw.js';
import {
  SerializableTransactionRetryExhaustedError,
  adjustStageDrawActionSchema,
  buildSessionPointPersistence,
  buildStageDrawPersistenceMetadata,
  copySessionPointSnapshots,
  deriveScoreDownstreamRoutes,
  finalizeSessionPoints,
  mapLockedScoreMatchError,
  mapSessionPersistenceError,
  mapStageDrawActionError,
  retrySerializableTransaction,
  scoreActionSchema,
  voidableSessionAwardReasons,
  voidFinalizedSession,
} from './sessions.js';
import * as sessionApi from './sessions.js';

const ids = {
  session: '00000000-0000-4000-8000-000000000001',
  match: '00000000-0000-4000-8000-000000000002',
  teamA: '00000000-0000-4000-8000-000000000003',
  teamB: '00000000-0000-4000-8000-000000000004',
};

const validRequest = {
  action: 'adjust_stage_draw',
  sessionId: ids.session,
  stage: {
    matchKind: 'placement',
    bracketRound: null,
    placementGroup: 1,
  },
  expectedMatches: [{ matchId: ids.match, teamAId: ids.teamA, teamBId: ids.teamB, sequence: 1 }],
  matches: [{ matchId: ids.match, teamAId: ids.teamB, teamBId: ids.teamA, sequence: 1 }],
} as const;

describe('adjust stage draw action schema', () => {
  it('accepts a complete request and rejects incomplete or empty layouts', () => {
    expect(adjustStageDrawActionSchema.parse(validRequest)).toEqual(validRequest);
    expect(adjustStageDrawActionSchema.safeParse({ ...validRequest, expectedMatches: [] }).success).toBe(false);
    expect(adjustStageDrawActionSchema.safeParse({
      ...validRequest,
      matches: [{ matchId: ids.match, teamAId: ids.teamA, sequence: 1 }],
    }).success).toBe(false);
  });
});

describe('score action schema', () => {
  it('requires the expected locked-team identity with the score intent', () => {
    const request = {
      action: 'score',
      matchId: ids.match,
      expectedTeamAId: ids.teamA,
      expectedTeamBId: ids.teamB,
      scoreA: 11,
      scoreB: 7,
      court: null,
    } as const;

    expect(scoreActionSchema.parse(request)).toEqual(request);
    const { expectedTeamAId: _missing, ...withoutExpectedTeamA } = request;
    expect(scoreActionSchema.safeParse(withoutExpectedTeamA).success).toBe(false);
  });

  it('maps locked unresolved and stale team state to stable score conflicts', () => {
    expect(mapLockedScoreMatchError({ teamAId: null, teamBId: null }, ids.teamA, ids.teamB)).toEqual({
      error: 'knockout_match_unresolved',
      message: 'Both feeder winners are required before scoring this match.',
    });
    expect(mapLockedScoreMatchError({ teamAId: ids.teamB, teamBId: ids.teamA }, ids.teamA, ids.teamB)).toEqual({
      error: 'stale_match',
      message: 'The teams in this match changed. Refresh before saving the score.',
    });
    expect(mapLockedScoreMatchError({ teamAId: ids.teamA, teamBId: ids.teamB }, ids.teamA, ids.teamB)).toBeNull();
  });
});

describe('adjust stage draw error mapping', () => {
  it('maps known planner failures to stable conflict errors and leaves unknown errors unmapped', () => {
    expect(mapStageDrawActionError(new StageDrawUnavailableError('Stage started.'))).toEqual({
      error: 'stage_draw_unavailable',
      message: 'Stage started.',
    });
    expect(mapStageDrawActionError(new StageDrawStaleError('Refresh first.'))).toEqual({
      error: 'invalid_stage_draw',
      message: 'Refresh first.',
    });
    expect(mapStageDrawActionError(new StageDrawValidationError('Invalid pairing.'))).toEqual({
      error: 'invalid_stage_draw',
      message: 'Invalid pairing.',
    });
    expect(mapStageDrawActionError(new SerializableTransactionRetryExhaustedError())).toEqual({
      error: 'stage_draw_unavailable',
      message: 'The stage draw could not be saved because the session changed concurrently. Refresh and try again.',
    });
    expect(mapStageDrawActionError(new Error('Unexpected.'))).toBeNull();
  });
});

describe('serializable transaction retry', () => {
  it('retries serialization and deadlock codes wrapped in nested causes', async () => {
    let attempts = 0;
    await expect(retrySerializableTransaction(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Drizzle query failed', {
          cause: Object.assign(new Error('serialization'), { code: '40001' }),
        });
      }
      if (attempts === 2) {
        throw {
          message: 'outer wrapper',
          cause: {
            message: 'inner wrapper',
            cause: { code: '40P01' },
          },
        };
      }
      return 'saved';
    })).resolves.toBe('saved');
    expect(attempts).toBe(3);
  });

  it('does not retry unrelated or cyclic cause chains', async () => {
    const unrelated = new Error('query failed', {
      cause: Object.assign(new Error('connection failed'), { code: '08006' }),
    });
    let unrelatedAttempts = 0;
    await expect(retrySerializableTransaction(async () => {
      unrelatedAttempts += 1;
      throw unrelated;
    })).rejects.toBe(unrelated);
    expect(unrelatedAttempts).toBe(1);

    const cyclic = Object.assign(new Error('cyclic wrapper'), { cause: null as unknown });
    cyclic.cause = cyclic;
    let cyclicAttempts = 0;
    await expect(retrySerializableTransaction(async () => {
      cyclicAttempts += 1;
      throw cyclic;
    })).rejects.toBe(cyclic);
    expect(cyclicAttempts).toBe(1);
  });

  it('retries serialization and deadlock failures up to three total attempts', async () => {
    let attempts = 0;
    await expect(retrySerializableTransaction(async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('serialization'), { code: '40001' });
      if (attempts === 2) throw Object.assign(new Error('deadlock'), { code: '40P01' });
      return 'saved';
    })).resolves.toBe('saved');
    expect(attempts).toBe(3);
  });

  it('exposes retry exhaustion and immediately rethrows unknown failures', async () => {
    let exhaustedAttempts = 0;
    await expect(retrySerializableTransaction(async () => {
      exhaustedAttempts += 1;
      throw Object.assign(new Error('serialization'), { code: '40001' });
    })).rejects.toBeInstanceOf(SerializableTransactionRetryExhaustedError);
    expect(exhaustedAttempts).toBe(3);

    const unknown = Object.assign(new Error('connection failed'), { code: '08006' });
    let unknownAttempts = 0;
    await expect(retrySerializableTransaction(async () => {
      unknownAttempts += 1;
      throw unknown;
    })).rejects.toBe(unknown);
    expect(unknownAttempts).toBe(1);
  });

  it('maps retry exhaustion to a stable session conflict without changing stage-draw messaging', () => {
    const exhausted = new SerializableTransactionRetryExhaustedError();
    expect(mapSessionPersistenceError(exhausted)).toEqual({
      error: 'session_conflict',
      message: 'The session changed concurrently. Refresh and try again.',
    });
    expect(mapStageDrawActionError(exhausted)).toEqual({
      error: 'stage_draw_unavailable',
      message: 'The stage draw could not be saved because the session changed concurrently. Refresh and try again.',
    });
    expect(mapSessionPersistenceError(new Error('connection failed'))).toBeNull();
  });
});

describe('stage draw persistence metadata', () => {
  it('moves reordered stage sequences above the session maximum and records complete audit details', () => {
    const otherMatchId = '00000000-0000-4000-8000-000000000005';
    const secondMatchId = '00000000-0000-4000-8000-000000000006';
    const metadata = buildStageDrawPersistenceMetadata({
      stage: {
        matchKind: 'round_robin',
        bracketRound: null,
        placementGroup: null,
      },
      matchRows: [
        { id: ids.match, teamAId: ids.teamA, teamBId: ids.teamB, sequence: 2 },
        { id: secondMatchId, teamAId: ids.teamB, teamBId: ids.teamA, sequence: 4 },
        { id: otherMatchId, teamAId: ids.teamA, teamBId: ids.teamB, sequence: 9 },
      ],
      adjustmentPlan: {
        slotUpdates: [
          { matchId: ids.match, teamAId: ids.teamB, teamBId: ids.teamA, sequence: 4 },
          { matchId: secondMatchId, teamAId: ids.teamA, teamBId: ids.teamB, sequence: 2 },
        ],
        routeUpdates: [{
          matchId: otherMatchId,
          outcome: 'winner',
          nextMatchId: ids.match,
          toSlot: 'B',
        }],
      },
    });

    expect(metadata.selectedMatchIds).toEqual([ids.match, secondMatchId]);
    expect(metadata.temporarySequenceOffset).toBe(8);
    expect([2, 4].map((sequence) => sequence + metadata.temporarySequenceOffset!))
      .toEqual([10, 12]);
    expect(metadata.auditDetails).toEqual({
      stage: {
        matchKind: 'round_robin',
        bracketRound: null,
        placementGroup: null,
      },
      before: [
        { matchId: ids.match, teamAId: ids.teamA, teamBId: ids.teamB, sequence: 2 },
        { matchId: secondMatchId, teamAId: ids.teamB, teamBId: ids.teamA, sequence: 4 },
      ],
      after: [
        { matchId: secondMatchId, teamAId: ids.teamA, teamBId: ids.teamB, sequence: 2 },
        { matchId: ids.match, teamAId: ids.teamB, teamBId: ids.teamA, sequence: 4 },
      ],
      routeUpdates: [{
        matchId: otherMatchId,
        outcome: 'winner',
        nextMatchId: ids.match,
        toSlot: 'B',
      }],
    });
  });
});

describe('score downstream routes', () => {
  it('derives winner and loser teams from the locked match and sorts routes by downstream match ID', () => {
    expect(deriveScoreDownstreamRoutes({
      teamAId: ids.teamA,
      teamBId: ids.teamB,
      nextMatchId: '00000000-0000-4000-8000-000000000009',
      winnerToSlot: 'A',
      loserNextMatchId: '00000000-0000-4000-8000-000000000005',
      loserToSlot: 'B',
    }, { scoreA: 11, scoreB: 7 })).toEqual([
      {
        outcome: 'loser',
        nextMatchId: '00000000-0000-4000-8000-000000000005',
        slot: 'B',
        teamId: ids.teamB,
      },
      {
        outcome: 'winner',
        nextMatchId: '00000000-0000-4000-8000-000000000009',
        slot: 'A',
        teamId: ids.teamA,
      },
    ]);
  });
});

describe('session point persistence', () => {
  it('reads the active rules, creates the session, and audits inside one transaction', async () => {
    const createPlaySessionWithAudit = Reflect.get(sessionApi, 'createPlaySessionWithAudit') as
      | ((database: unknown, operations: unknown) => Promise<unknown>)
      | undefined;
    expect(createPlaySessionWithAudit).toBeTypeOf('function');
    if (!createPlaySessionWithAudit) return;

    const transaction = { marker: 'session-create-transaction' };
    const calls: string[] = [];
    const season = {
      id: 'season-1',
      winPoints: 1,
      lossPoints: 0,
      firstPlaceBonus: 4,
      secondPlaceBonus: 2,
      thirdPlaceBonus: 1,
      maxSessionPoints: 8,
    };
    const session = { id: ids.session };
    const result = await createPlaySessionWithAudit({
      transaction: async (body: (tx: typeof transaction) => Promise<unknown>) => body(transaction),
    }, {
      findActiveSeason: async (tx: unknown) => {
        expect(tx).toBe(transaction);
        calls.push('season');
        return season;
      },
      insertSession: async (tx: unknown, activeSeason: unknown) => {
        expect(tx).toBe(transaction);
        expect(activeSeason).toBe(season);
        calls.push('session');
        return session;
      },
      insertAudit: async (tx: unknown, createdSession: unknown, activeSeason: unknown) => {
        expect(tx).toBe(transaction);
        expect(createdSession).toBe(session);
        expect(activeSeason).toBe(season);
        calls.push('audit');
      },
    });

    expect(result).toEqual({ session });
    expect(calls).toEqual(['season', 'session', 'audit']);
  });

  it('runs finalization and voiding through an injected serializable database boundary', async () => {
    const calls: unknown[] = [];
    const database = {
      transaction: async (_body: unknown, options: unknown) => {
        calls.push(options);
        return calls.length === 1
          ? { sessionId: ids.session }
          : { sessionId: ids.session, replacementId: null };
      },
    };

    await expect(finalizeSessionPoints(
      database as never,
      ids.session,
      '00000000-0000-4000-8000-000000000011',
    )).resolves.toEqual({ sessionId: ids.session });
    await expect(voidFinalizedSession(
      database as never,
      {
        sessionId: ids.session,
        reason: 'Weather made the recorded session invalid.',
        createReplacement: false,
      },
      '00000000-0000-4000-8000-000000000011',
    )).resolves.toEqual({ sessionId: ids.session, replacementId: null });

    expect(calls).toEqual([
      { isolationLevel: 'serializable' },
      { isolationLevel: 'serializable' },
    ]);
  });

  it.each([
    ['finalization', (database: never) => finalizeSessionPoints(
      database,
      ids.session,
      '00000000-0000-4000-8000-000000000011',
    ), { sessionId: ids.session }],
    ['voiding', (database: never) => voidFinalizedSession(
      database,
      {
        sessionId: ids.session,
        reason: 'Weather made the recorded session invalid.',
        createReplacement: false,
      },
      '00000000-0000-4000-8000-000000000011',
    ), { sessionId: ids.session, replacementId: null }],
  ])('retries a serialization failure during %s', async (_name, operation, expected) => {
    let attempts = 0;
    const database = {
      transaction: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error('serialization'), { code: '40001' });
        }
        return expected;
      },
    };

    await expect(operation(database as never)).resolves.toEqual(expected);
    expect(attempts).toBe(2);
  });

  it('maps every award reason to deterministic ledger keys and complete audit metadata', () => {
    const persistence = buildSessionPointPersistence({
      session: {
        id: ids.session,
        seasonId: '00000000-0000-4000-8000-000000000010',
        winPointsSnapshot: 1,
        lossPointsSnapshot: 0,
        firstPlaceBonusSnapshot: 4,
        secondPlaceBonusSnapshot: 2,
        thirdPlaceBonusSnapshot: 1,
        maxSessionPointsSnapshot: 8,
      },
      matchCount: 3,
      createdBy: '00000000-0000-4000-8000-000000000011',
      plan: {
        playerAwards: [
          { playerId: 'player-1', teamId: ids.teamA, type: 'match_win', points: 1, matchId: ids.match },
          { playerId: 'player-2', teamId: ids.teamB, type: 'match_loss', points: 0, matchId: ids.match },
          { playerId: 'player-1', teamId: ids.teamA, type: 'placement_bonus', points: 4, matchId: null },
          { playerId: 'player-1', teamId: ids.teamA, type: 'session_cap_adjustment', points: -1, matchId: null },
        ],
        teamSummaries: [
          { teamId: ids.teamA, placement: 1, rawPoints: 9, cappedPoints: 8, capAdjustment: -1 },
          { teamId: ids.teamB, placement: 2, rawPoints: 2, cappedPoints: 2, capAdjustment: 0 },
        ],
      },
    });

    expect(persistence.ledgerRows).toEqual([
      expect.objectContaining({
        reason: 'match_win',
        matchId: ids.match,
        idempotencyKey: `award:${ids.session}:${ids.match}:player-1`,
      }),
      expect.objectContaining({
        reason: 'match_loss',
        matchId: ids.match,
        idempotencyKey: `award:${ids.session}:${ids.match}:player-2`,
      }),
      expect.objectContaining({
        reason: 'placement_bonus',
        matchId: null,
        idempotencyKey: `award:${ids.session}:placement:player-1`,
      }),
      expect.objectContaining({
        reason: 'session_cap_adjustment',
        matchId: null,
        points: -1,
        idempotencyKey: `award:${ids.session}:cap:player-1`,
      }),
    ]);
    expect(persistence.auditDetails).toEqual({
      matchCount: 3,
      rules: {
        winPoints: 1,
        lossPoints: 0,
        firstPlaceBonus: 4,
        secondPlaceBonus: 2,
        thirdPlaceBonus: 1,
        maxSessionPoints: 8,
      },
      teams: [
        { teamId: ids.teamA, placement: 1, rawPoints: 9, cappedPoints: 8, capAdjustment: -1 },
        { teamId: ids.teamB, placement: 2, rawPoints: 2, cappedPoints: 2, capAdjustment: 0 },
      ],
    });
  });

  it('assigns stable distinct keys to multiple cap chunks while preserving the first cap key', () => {
    const persistence = buildSessionPointPersistence({
      session: {
        id: ids.session,
        seasonId: '00000000-0000-4000-8000-000000000010',
        winPointsSnapshot: 99_999_999_999.9,
        lossPointsSnapshot: 0,
        firstPlaceBonusSnapshot: 0,
        secondPlaceBonusSnapshot: 0,
        thirdPlaceBonusSnapshot: 0,
        maxSessionPointsSnapshot: 0.1,
      },
      matchCount: 2,
      createdBy: '00000000-0000-4000-8000-000000000011',
      plan: {
        playerAwards: [
          { playerId: 'player-1', teamId: ids.teamA, type: 'session_cap_adjustment', points: -99_999_999_999.9, matchId: null },
          { playerId: 'player-1', teamId: ids.teamA, type: 'session_cap_adjustment', points: -99_999_999_999.8, matchId: null },
          { playerId: 'player-2', teamId: ids.teamA, type: 'session_cap_adjustment', points: -99_999_999_999.9, matchId: null },
          { playerId: 'player-2', teamId: ids.teamA, type: 'session_cap_adjustment', points: -99_999_999_999.8, matchId: null },
        ],
        teamSummaries: [{
          teamId: ids.teamA,
          placement: 1,
          rawPoints: 199_999_999_999.8,
          cappedPoints: 0.1,
          capAdjustment: -199_999_999_999.7,
        }],
      },
    });

    expect(persistence.ledgerRows.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      `award:${ids.session}:cap:player-1`,
      `award:${ids.session}:cap:2:player-1`,
      `award:${ids.session}:cap:player-2`,
      `award:${ids.session}:cap:2:player-2`,
    ]);
    expect(new Set(persistence.ledgerRows.map(({ idempotencyKey }) => idempotencyKey)).size)
      .toBe(persistence.ledgerRows.length);
  });

  it('copies all six point snapshots to replacement sessions', () => {
    expect(copySessionPointSnapshots({
      winPointsSnapshot: 1.5,
      lossPointsSnapshot: 0.5,
      firstPlaceBonusSnapshot: 4.5,
      secondPlaceBonusSnapshot: 2.5,
      thirdPlaceBonusSnapshot: 1.5,
      maxSessionPointsSnapshot: 9.5,
    })).toEqual({
      winPointsSnapshot: 1.5,
      lossPointsSnapshot: 0.5,
      firstPlaceBonusSnapshot: 4.5,
      secondPlaceBonusSnapshot: 2.5,
      thirdPlaceBonusSnapshot: 1.5,
      maxSessionPointsSnapshot: 9.5,
    });
  });

  it('defines every finalization award reason as voidable', () => {
    expect(voidableSessionAwardReasons).toEqual([
      'match_win',
      'match_loss',
      'placement_bonus',
      'session_cap_adjustment',
    ]);
  });
});
