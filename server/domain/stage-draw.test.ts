import { describe, expect, it } from 'vitest';
import {
  planStageDrawAdjustment,
  StageDrawStaleError,
  StageDrawUnavailableError,
  StageDrawValidationError,
  type StageKey,
  type StageMatchRow,
  type StageSnapshot,
} from './stage-draw';

const championshipRoundOne: StageKey = {
  matchKind: 'championship',
  bracketRound: 1,
  placementGroup: null,
};

const qualifierStage: StageKey = {
  matchKind: 'qualifier',
  bracketRound: null,
  placementGroup: null,
};

function match(overrides: Partial<StageMatchRow> & Pick<StageMatchRow, 'id'>): StageMatchRow {
  return {
    id: overrides.id,
    matchKind: 'championship',
    bracketRound: 1,
    placementGroup: null,
    sequence: 1,
    status: 'pending',
    teamAId: 'team-a',
    teamBId: 'team-b',
    scoreA: null,
    scoreB: null,
    nextMatchId: null,
    winnerToSlot: null,
    loserNextMatchId: null,
    loserToSlot: null,
    ...overrides,
  };
}

function snapshots(matches: readonly StageMatchRow[]): StageSnapshot[] {
  return matches.map(({ id: matchId, teamAId, teamBId, sequence }) => ({
    matchId,
    teamAId: teamAId!,
    teamBId: teamBId!,
    sequence,
  }));
}

function plan(
  matches: readonly StageMatchRow[],
  desired: readonly StageSnapshot[],
  overrides: Partial<Parameters<typeof planStageDrawAdjustment>[0]> = {},
) {
  return planStageDrawAdjustment({
    sessionStatus: 'draw_published',
    stage: championshipRoundOne,
    matches,
    expected: snapshots(matches.filter((candidate) =>
      candidate.matchKind === championshipRoundOne.matchKind
      && candidate.bracketRound === championshipRoundOne.bracketRound
      && candidate.placementGroup === championshipRoundOne.placementGroup)),
    desired,
    ...overrides,
  });
}

describe('stage draw adjustment planning', () => {
  it.each([
    ['qualifier', qualifierStage],
    ['quarterfinal', championshipRoundOne],
  ] as const)('adjusts a direct-team %s stage', (_label, stage) => {
    const rows = [
      match({ id: 'm1', matchKind: stage.matchKind, bracketRound: stage.bracketRound, sequence: 10, teamAId: 'a', teamBId: 'b' }),
      match({ id: 'm2', matchKind: stage.matchKind, bracketRound: stage.bracketRound, sequence: 11, teamAId: 'c', teamBId: 'd' }),
    ];

    expect(planStageDrawAdjustment({
      sessionStatus: 'draw_published',
      stage,
      matches: rows,
      expected: snapshots(rows),
      desired: [
        { matchId: 'm1', teamAId: 'd', teamBId: 'b', sequence: 10 },
        { matchId: 'm2', teamAId: 'c', teamBId: 'a', sequence: 11 },
      ],
    })).toEqual({
      slotUpdates: [
        { matchId: 'm1', teamAId: 'd', teamBId: 'b', sequence: 10 },
        { matchId: 'm2', teamAId: 'c', teamBId: 'a', sequence: 11 },
      ],
      routeUpdates: [],
    });
  });

  it('moves completed winner feeders with their teams in a championship stage', () => {
    const rows = [
      match({ id: 'semi-1', bracketRound: 0, status: 'completed', teamAId: 'a', teamBId: 'x', scoreA: 11, scoreB: 7, nextMatchId: 'final', winnerToSlot: 'A' }),
      match({ id: 'semi-2', bracketRound: 0, status: 'completed', teamAId: 'y', teamBId: 'b', scoreA: 5, scoreB: 11, nextMatchId: 'final', winnerToSlot: 'B' }),
      match({ id: 'final', bracketRound: 1, sequence: 3, teamAId: 'a', teamBId: 'b' }),
    ];

    expect(plan(rows, [
      { matchId: 'final', teamAId: 'b', teamBId: 'a', sequence: 3 },
    ])).toEqual({
      slotUpdates: [{ matchId: 'final', teamAId: 'b', teamBId: 'a', sequence: 3 }],
      routeUpdates: [
        { matchId: 'semi-2', outcome: 'winner', nextMatchId: 'final', toSlot: 'A' },
        { matchId: 'semi-1', outcome: 'winner', nextMatchId: 'final', toSlot: 'B' },
      ],
    });
  });

  it('moves loser and winner feeders in the same placement stage', () => {
    const stage: StageKey = { matchKind: 'placement', bracketRound: 1, placementGroup: 2 };
    const rows = [
      match({ id: 'champ', bracketRound: 0, status: 'completed', teamAId: 'a', teamBId: 'b', scoreA: 11, scoreB: 8, loserNextMatchId: 'place', loserToSlot: 'A' }),
      match({ id: 'place-prelim', matchKind: 'placement', bracketRound: 0, placementGroup: 2, status: 'completed', teamAId: 'c', teamBId: 'd', scoreA: 11, scoreB: 9, nextMatchId: 'place', winnerToSlot: 'B' }),
      match({ id: 'place', matchKind: 'placement', bracketRound: 1, placementGroup: 2, sequence: 8, teamAId: 'b', teamBId: 'c' }),
    ];

    expect(planStageDrawAdjustment({
      sessionStatus: 'in_progress',
      stage,
      matches: rows,
      expected: snapshots([rows[2]]),
      desired: [{ matchId: 'place', teamAId: 'c', teamBId: 'b', sequence: 8 }],
    })).toEqual({
      slotUpdates: [{ matchId: 'place', teamAId: 'c', teamBId: 'b', sequence: 8 }],
      routeUpdates: [
        { matchId: 'place-prelim', outcome: 'winner', nextMatchId: 'place', toSlot: 'A' },
        { matchId: 'champ', outcome: 'loser', nextMatchId: 'place', toSlot: 'B' },
      ],
    });
  });

  it('supports a stage containing both direct teams and a preliminary winner', () => {
    const rows = [
      match({ id: 'prelim', bracketRound: 0, status: 'completed', teamAId: 'winner', teamBId: 'out', scoreA: 11, scoreB: 4, nextMatchId: 'q1', winnerToSlot: 'A' }),
      match({ id: 'q1', sequence: 2, teamAId: 'winner', teamBId: 'b' }),
      match({ id: 'q2', sequence: 3, teamAId: 'c', teamBId: 'd' }),
    ];

    expect(plan(rows, [
      { matchId: 'q1', teamAId: 'd', teamBId: 'b', sequence: 2 },
      { matchId: 'q2', teamAId: 'c', teamBId: 'winner', sequence: 3 },
    ])).toEqual({
      slotUpdates: [
        { matchId: 'q1', teamAId: 'd', teamBId: 'b', sequence: 2 },
        { matchId: 'q2', teamAId: 'c', teamBId: 'winner', sequence: 3 },
      ],
      routeUpdates: [
        { matchId: 'prelim', outcome: 'winner', nextMatchId: 'q2', toSlot: 'B' },
      ],
    });
  });

  it('allows a final A/B swap and keeps match identity and downstream routes unchanged', () => {
    const rows = [
      match({ id: 'final', bracketRound: 3, sequence: 12, teamAId: 'a', teamBId: 'b', nextMatchId: 'later', winnerToSlot: 'A' }),
    ];
    const stage = { ...championshipRoundOne, bracketRound: 3 };

    expect(planStageDrawAdjustment({
      sessionStatus: 'draw_published',
      stage,
      matches: rows,
      expected: snapshots(rows),
      desired: [{ matchId: 'final', teamAId: 'b', teamBId: 'a', sequence: 12 }],
    })).toEqual({
      slotUpdates: [{ matchId: 'final', teamAId: 'b', teamBId: 'a', sequence: 12 }],
      routeUpdates: [],
    });
  });

  it('reorders round-robin sequences and flips sides without changing opponents', () => {
    const stage: StageKey = { matchKind: 'round_robin', bracketRound: null, placementGroup: null };
    const rows = [
      match({ id: 'rr1', matchKind: 'round_robin', bracketRound: null, sequence: 1, teamAId: 'a', teamBId: 'b' }),
      match({ id: 'rr2', matchKind: 'round_robin', bracketRound: null, sequence: 2, teamAId: 'a', teamBId: 'c' }),
    ];
    const desired = [
      { matchId: 'rr1', teamAId: 'b', teamBId: 'a', sequence: 2 },
      { matchId: 'rr2', teamAId: 'c', teamBId: 'a', sequence: 1 },
    ];

    expect(planStageDrawAdjustment({
      sessionStatus: 'draw_published', stage, matches: rows, expected: snapshots(rows), desired,
    })).toEqual({ slotUpdates: desired, routeUpdates: [] });
  });

  it.each(['draft', 'finalized', 'voided'])('rejects a %s session as unavailable', (sessionStatus) => {
    const rows = [match({ id: 'q1' })];
    expect(() => plan(rows, snapshots(rows), { sessionStatus })).toThrowError(StageDrawUnavailableError);
    expect(() => plan(rows, snapshots(rows), { sessionStatus })).toThrow(/published or in progress/i);
  });

  it('rejects a stage that does not exist', () => {
    const rows = [match({ id: 'q1' })];
    expect(() => plan(rows, snapshots(rows), {
      stage: { ...championshipRoundOne, bracketRound: 99 },
      expected: [],
      desired: [],
    })).toThrowError(StageDrawUnavailableError);
  });

  it.each([
    ['unresolved', { teamBId: null }, /resolved/i],
    ['started', { status: 'completed' }, /started/i],
  ] as const)('rejects an %s stage', (_label, changed, message) => {
    const rows = [match({ id: 'q1', ...changed })];
    expect(() => plan(rows, snapshots(rows))).toThrowError(StageDrawUnavailableError);
    expect(() => plan(rows, snapshots(rows))).toThrow(message);
  });

  it('rejects stale snapshots when IDs, slots, or sequences no longer match', () => {
    const rows = [match({ id: 'q1', sequence: 2 })];
    const expected = [{ matchId: 'q1', teamAId: 'old-a', teamBId: 'team-b', sequence: 1 }];
    expect(() => plan(rows, snapshots(rows), { expected })).toThrowError(StageDrawStaleError);
    expect(() => plan(rows, snapshots(rows), { expected })).toThrow(/changed.*refresh/i);
  });

  it.each([
    ['mixed-stage IDs', [
      { matchId: 'q1', teamAId: 'team-a', teamBId: 'team-b', sequence: 1 },
      { matchId: 'other', teamAId: 'c', teamBId: 'd', sequence: 2 },
    ]],
    ['an incomplete set', []],
    ['duplicate match IDs', [
      { matchId: 'q1', teamAId: 'team-a', teamBId: 'team-b', sequence: 1 },
      { matchId: 'q1', teamAId: 'team-a', teamBId: 'team-b', sequence: 1 },
    ]],
  ] as const)('rejects desired snapshots containing %s', (_label, desired) => {
    const rows = [match({ id: 'q1' })];
    expect(() => plan(rows, desired)).toThrowError(StageDrawValidationError);
    expect(() => plan(rows, desired)).toThrow(/exactly.*match IDs/i);
  });

  it.each([
    ['a duplicate team', [{ matchId: 'q1', teamAId: 'team-a', teamBId: 'team-a', sequence: 1 }], /once|itself/i],
    ['an outside team', [{ matchId: 'q1', teamAId: 'team-a', teamBId: 'outside', sequence: 1 }], /cohort/i],
    ['a self-match', [{ matchId: 'q1', teamAId: 'team-b', teamBId: 'team-b', sequence: 1 }], /itself/i],
  ] as const)('rejects %s', (_label, desired, message) => {
    const rows = [match({ id: 'q1' })];
    expect(() => plan(rows, desired)).toThrowError(StageDrawValidationError);
    expect(() => plan(rows, desired)).toThrow(message);
  });

  it('keeps sequence values tied to bracket match IDs', () => {
    const rows = [
      match({ id: 'q1', sequence: 1, teamAId: 'a', teamBId: 'b' }),
      match({ id: 'q2', sequence: 2, teamAId: 'c', teamBId: 'd' }),
    ];
    expect(() => plan(rows, [
      { matchId: 'q1', teamAId: 'a', teamBId: 'b', sequence: 2 },
      { matchId: 'q2', teamAId: 'c', teamBId: 'd', sequence: 1 },
    ])).toThrow(/sequence/i);
  });

  it.each([
    ['opponent changes', [
      { matchId: 'rr1', teamAId: 'a', teamBId: 'c', sequence: 1 },
      { matchId: 'rr2', teamAId: 'a', teamBId: 'b', sequence: 2 },
    ], /opponent/i],
    ['non-permutation sequences', [
      { matchId: 'rr1', teamAId: 'a', teamBId: 'b', sequence: 1 },
      { matchId: 'rr2', teamAId: 'a', teamBId: 'c', sequence: 1 },
    ], /sequence/i],
  ] as const)('rejects round-robin %s', (_label, desired, message) => {
    const stage: StageKey = { matchKind: 'round_robin', bracketRound: null, placementGroup: null };
    const rows = [
      match({ id: 'rr1', matchKind: 'round_robin', bracketRound: null, sequence: 1, teamAId: 'a', teamBId: 'b' }),
      match({ id: 'rr2', matchKind: 'round_robin', bracketRound: null, sequence: 2, teamAId: 'a', teamBId: 'c' }),
    ];
    expect(() => planStageDrawAdjustment({
      sessionStatus: 'draw_published', stage, matches: rows, expected: snapshots(rows), desired,
    })).toThrow(message);
  });

  it('rejects incomplete and ambiguous feeder origins', () => {
    const target = match({ id: 'q1', teamAId: 'a', teamBId: 'b' });
    const incomplete = match({ id: 'source', bracketRound: 0, status: 'completed', teamAId: 'a', teamBId: 'x', scoreA: null, scoreB: 7, nextMatchId: 'q1', winnerToSlot: 'A' });
    expect(() => plan([incomplete, target], snapshots([target]))).toThrow(/completed.*score/i);

    const sourceTwo = match({ id: 'source-2', bracketRound: 0, status: 'completed', teamAId: 'a', teamBId: 'y', scoreA: 11, scoreB: 8, nextMatchId: 'q1', winnerToSlot: 'A' });
    const sourceOne = { ...incomplete, scoreA: 11 };
    expect(() => plan([sourceOne, sourceTwo, target], snapshots([target]))).toThrow(/exactly one feeder/i);
  });

  it('rejects malformed route fields and feeder outcomes that do not match the target team', () => {
    const target = match({ id: 'q1', teamAId: 'a', teamBId: 'b' });
    const malformed = match({ id: 'source', bracketRound: 0, status: 'completed', teamAId: 'a', teamBId: 'x', scoreA: 11, scoreB: 7, nextMatchId: 'q1', winnerToSlot: null });
    expect(() => plan([malformed, target], snapshots([target]))).toThrow(/route.*slot/i);

    const mismatched = { ...malformed, winnerToSlot: 'A' as const, scoreA: 7, scoreB: 11 };
    expect(() => plan([mismatched, target], snapshots([target]))).toThrow(/does not match/i);
  });

  it('ignores malformed routes that do not feed the selected stage', () => {
    const unrelated = match({
      id: 'unrelated-source',
      bracketRound: 0,
      status: 'completed',
      teamAId: 'x',
      teamBId: 'y',
      scoreA: 11,
      scoreB: 8,
      nextMatchId: 'unrelated-target',
      winnerToSlot: null,
    });
    const target = match({ id: 'q1', teamAId: 'a', teamBId: 'b' });

    expect(plan([unrelated, target], snapshots([target]))).toEqual({
      slotUpdates: snapshots([target]),
      routeUpdates: [],
    });
  });

  it('rejects duplicate feeder match IDs before returning conflicting route updates', () => {
    const rows = [
      match({ id: 'duplicate-source', bracketRound: 0, status: 'completed', teamAId: 'a', teamBId: 'x', scoreA: 11, scoreB: 7, nextMatchId: 'q1', winnerToSlot: 'A' }),
      match({ id: 'duplicate-source', bracketRound: 0, status: 'completed', teamAId: 'c', teamBId: 'y', scoreA: 11, scoreB: 8, nextMatchId: 'q2', winnerToSlot: 'A' }),
      match({ id: 'q1', sequence: 2, teamAId: 'a', teamBId: 'b' }),
      match({ id: 'q2', sequence: 3, teamAId: 'c', teamBId: 'd' }),
    ];

    expect(() => plan(rows, [
      { matchId: 'q1', teamAId: 'c', teamBId: 'b', sequence: 2 },
      { matchId: 'q2', teamAId: 'a', teamBId: 'd', sequence: 3 },
    ])).toThrowError(StageDrawValidationError);
    expect(() => plan(rows, snapshots([rows[2], rows[3]]))).toThrow(/duplicate match IDs/i);
  });

  it('routes a later corrected feeder result to the adjusted destination', () => {
    const rows = [
      match({ id: 'semi', bracketRound: 0, status: 'completed', teamAId: 'a', teamBId: 'x', scoreA: 11, scoreB: 7, nextMatchId: 'q1', winnerToSlot: 'A' }),
      match({ id: 'q1', sequence: 2, teamAId: 'a', teamBId: 'b' }),
      match({ id: 'q2', sequence: 3, teamAId: 'c', teamBId: 'd' }),
    ];
    const result = plan(rows, [
      { matchId: 'q1', teamAId: 'd', teamBId: 'b', sequence: 2 },
      { matchId: 'q2', teamAId: 'c', teamBId: 'a', sequence: 3 },
    ]);

    const correctedWinnerTeamId = rows[0].teamBId;
    expect(result.routeUpdates).toContainEqual({
      matchId: 'semi', outcome: 'winner', nextMatchId: 'q2', toSlot: 'B',
    });
    expect({ nextMatchId: result.routeUpdates[0].nextMatchId, slot: result.routeUpdates[0].toSlot, correctedWinnerTeamId }).toEqual({
      nextMatchId: 'q2', slot: 'B', correctedWinnerTeamId: 'x',
    });
  });
});
