import { describe, expect, it } from 'vitest';
import {
  assignRankedGroups,
  buildConfiguredDraw,
  buildDefaultKnockoutConfig,
  buildDrawPersistenceRows,
  buildKnockoutDraw,
  buildKnockoutTournament,
  buildQualifyingKnockoutMatches,
  buildQualifyingConsolationMatch,
  buildRoundRobinDraw,
  calculateMatchAwards,
  planAttendanceRollback,
  planQuarterFinalConfigReturn,
  planPlacementRepair,
  knockoutStageLabel,
  rankQualifyingTeams,
  resolveQualifyingKnockoutTeams,
  validateQualifyingKnockoutFinalization,
  validateOutcomeAdvancement,
  validateWinnerAdvancement,
  validateCompletedScore,
  validateDraftFormatChange,
} from './competition';

describe('draft format changes', () => {
  it('allows draft sessions and rejects every later state', () => {
    expect(() => validateDraftFormatChange('draft')).not.toThrow();
    for (const status of ['draw_published', 'in_progress', 'finalized', 'voided']) {
      expect(() => validateDraftFormatChange(status)).toThrow(/draft/i);
    }
  });
});

describe('knockout winner advancement', () => {
  it('allows initial advancement and corrections before downstream scoring', () => {
    expect(() => validateWinnerAdvancement(null, 'team-a', false)).not.toThrow();
    expect(() => validateWinnerAdvancement('team-a', 'team-b', false)).not.toThrow();
  });

  it('blocks a changed winner after the downstream match is scored', () => {
    expect(() => validateWinnerAdvancement('team-a', 'team-b', true)).toThrow(/downstream/i);
    expect(() => validateWinnerAdvancement('team-a', 'team-a', true)).not.toThrow();
  });

  it('validates winner and loser paths together', () => {
    expect(() => validateOutcomeAdvancement({
      currentWinnerTeamId: 'team-a',
      nextWinnerTeamId: 'team-b',
      winnerDownstreamScored: false,
      currentLoserTeamId: 'team-b',
      nextLoserTeamId: 'team-a',
      loserDownstreamScored: false,
    })).not.toThrow();
    expect(() => validateOutcomeAdvancement({
      currentWinnerTeamId: 'team-a',
      nextWinnerTeamId: 'team-b',
      winnerDownstreamScored: false,
      currentLoserTeamId: 'team-b',
      nextLoserTeamId: 'team-a',
      loserDownstreamScored: true,
    })).toThrow(/downstream/i);
  });
});

describe('knockout bracket generation', () => {
  it.each([
    [4, 0, 4],
    [6, 2, 4],
    [8, 0, 8],
    [10, 2, 8],
  ])('builds defaults for %i teams', (teamCount, preliminaryCount, mainSize) => {
    const config = buildDefaultKnockoutConfig(teamCount);
    expect(config.preliminaryPairs).toHaveLength(preliminaryCount);
    expect(config.mainSources).toHaveLength(mainSize);
    const draw = buildKnockoutDraw(teamCount, config);
    expect(draw.matches.filter((match) => match.round === 0)).toHaveLength(preliminaryCount);
    expect(draw.matches.filter((match) => match.round === 1)).toHaveLength(mainSize / 2);
    expect(draw.matches.at(-1)?.round).toBe(Math.log2(mainSize));
  });

  it('pairs high versus low in preliminaries and seeds ten teams into an eight-team bracket', () => {
    const config = buildDefaultKnockoutConfig(10);
    expect(config.preliminaryPairs).toEqual([[6, 9], [7, 8]]);
    expect(config.mainSources).toEqual([
      { kind: 'team', teamIndex: 0 },
      { kind: 'preliminary', matchIndex: 1 },
      { kind: 'team', teamIndex: 3 },
      { kind: 'team', teamIndex: 4 },
      { kind: 'team', teamIndex: 1 },
      { kind: 'preliminary', matchIndex: 0 },
      { kind: 'team', teamIndex: 2 },
      { kind: 'team', teamIndex: 5 },
    ]);
  });

  it('accepts custom preliminary and main paths but rejects reused sources', () => {
    const config = buildDefaultKnockoutConfig(6);
    const custom = {
      preliminaryPairs: [...config.preliminaryPairs].reverse(),
      mainSources: [...config.mainSources].reverse(),
    };
    expect(buildKnockoutDraw(6, custom).matches).toHaveLength(5);
    expect(() => buildKnockoutDraw(6, {
      ...config,
      mainSources: config.mainSources.map((source) => ({ ...source })).fill(config.mainSources[0], 1, 2),
    })).toThrow(/exactly once/i);
  });

  it('labels bracket stages by their match count', () => {
    expect(knockoutStageLabel(0, 2)).toBe('Preliminary');
    expect(knockoutStageLabel(1, 8)).toBe('Round of 16');
    expect(knockoutStageLabel(1, 4)).toBe('Quarterfinal');
    expect(knockoutStageLabel(2, 2)).toBe('Semifinal');
    expect(knockoutStageLabel(3, 1)).toBe('Final');
  });

  it('builds championship and complete placement routes for eight teams', () => {
    const tournament = buildKnockoutTournament(8, buildDefaultKnockoutConfig(8));
    const championship = tournament.matches.filter((match) => match.matchKind === 'championship');
    const placements = tournament.matches.filter((match) => match.matchKind === 'placement');

    expect(championship).toHaveLength(7);
    expect(placements).toHaveLength(5);
    expect(tournament.placementGroups).toEqual([
      { id: 1, bestRank: 3, worstRank: 4, entryMatchKeys: ['round-2-0', 'round-2-1'] },
      { id: 2, bestRank: 5, worstRank: 8, entryMatchKeys: ['round-1-0', 'round-1-1', 'round-1-2', 'round-1-3'] },
    ]);
    expect(placements.filter((match) => match.placementGroup === 1)).toHaveLength(1);
    expect(placements.filter((match) => match.placementGroup === 2)).toHaveLength(4);

    for (const sourceKey of ['round-2-0', 'round-2-1', 'round-1-0', 'round-1-1', 'round-1-2', 'round-1-3']) {
      expect(championship.find((match) => match.key === sourceKey)?.loserNextKey).toBeTruthy();
    }
    expect(championship.find((match) => match.key === 'round-3-0')?.loserNextKey).toBeNull();
  });

  it('classifies preliminary losers and merges a singleton into the next cohort', () => {
    const tenTeam = buildKnockoutTournament(10, buildDefaultKnockoutConfig(10));
    expect(tenTeam.placementGroups.map(({ bestRank, worstRank }) => [bestRank, worstRank])).toEqual([
      [3, 4],
      [5, 8],
      [9, 10],
    ]);

    const nineTeam = buildKnockoutTournament(9, buildDefaultKnockoutConfig(9));
    expect(nineTeam.placementGroups.map(({ bestRank, worstRank, entryMatchKeys }) => ({
      bestRank,
      worstRank,
      entryCount: entryMatchKeys.length,
    }))).toEqual([
      { bestRank: 3, worstRank: 4, entryCount: 2 },
      { bestRank: 5, worstRank: 9, entryCount: 5 },
    ]);
    expect(nineTeam.matches.filter((match) => match.matchKind === 'placement' && match.placementGroup === 2).length).toBeGreaterThan(4);
  });
});

describe('qualifying knockout format', () => {
  it('creates five adjacent qualifying matches for exactly ten teams', () => {
    expect(buildQualifyingKnockoutMatches(10)).toEqual([
      { teamAIndex: 0, teamBIndex: 1, sequence: 1 },
      { teamAIndex: 2, teamBIndex: 3, sequence: 2 },
      { teamAIndex: 4, teamBIndex: 5, sequence: 3 },
      { teamAIndex: 6, teamBIndex: 7, sequence: 4 },
      { teamAIndex: 8, teamBIndex: 9, sequence: 5 },
    ]);
    expect(() => buildQualifyingKnockoutMatches(8)).toThrow(/exactly ten/i);
  });

  it('creates manually configured qualifying matches', () => {
    expect(buildQualifyingKnockoutMatches(10, {
      qualifyingPairs: [[4, 9], [0, 2], [1, 8], [3, 7], [5, 6]],
    })).toEqual([
      { teamAIndex: 4, teamBIndex: 9, sequence: 1 },
      { teamAIndex: 0, teamBIndex: 2, sequence: 2 },
      { teamAIndex: 1, teamBIndex: 8, sequence: 3 },
      { teamAIndex: 3, teamBIndex: 7, sequence: 4 },
      { teamAIndex: 5, teamBIndex: 6, sequence: 5 },
    ]);
    expect(() => buildQualifyingKnockoutMatches(10, {
      qualifyingPairs: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 8]],
    })).toThrow(/used exactly once/i);
  });

  it('ranks qualifiers by win percentage, point differential, points scored, then seed', () => {
    const standings = rankQualifyingTeams([
      { teamId: 'seed-1', seed: 1, scoreFor: 11, scoreAgainst: 8 },
      { teamId: 'seed-2', seed: 2, scoreFor: 8, scoreAgainst: 11 },
      { teamId: 'seed-3', seed: 3, scoreFor: 11, scoreAgainst: 3 },
      { teamId: 'seed-4', seed: 4, scoreFor: 3, scoreAgainst: 11 },
      { teamId: 'seed-5', seed: 5, scoreFor: 11, scoreAgainst: 9 },
      { teamId: 'seed-6', seed: 6, scoreFor: 9, scoreAgainst: 11 },
      { teamId: 'seed-7', seed: 7, scoreFor: 11, scoreAgainst: 6 },
      { teamId: 'seed-8', seed: 8, scoreFor: 6, scoreAgainst: 11 },
      { teamId: 'seed-9', seed: 9, scoreFor: 12, scoreAgainst: 10 },
      { teamId: 'seed-10', seed: 10, scoreFor: 10, scoreAgainst: 12 },
    ]);

    expect(standings.map((team) => team.teamId)).toEqual([
      'seed-3',
      'seed-7',
      'seed-1',
      'seed-9',
      'seed-5',
      'seed-10',
      'seed-6',
      'seed-2',
      'seed-8',
      'seed-4',
    ]);
    expect(standings.slice(0, 8).map((team) => team.qualified)).toEqual(Array(8).fill(true));
    expect(standings.slice(8).map((team) => team.qualified)).toEqual([false, false]);
  });

  it('does not allow finalization before the knockout stage exists', () => {
    expect(() =>
      validateQualifyingKnockoutFinalization('qualifying_knockout', [
        { bracketRound: null, status: 'completed' },
        { bracketRound: null, status: 'completed' },
      ]),
    ).toThrow(/knockout bracket/i);
    expect(() =>
      validateQualifyingKnockoutFinalization('qualifying_knockout', [
        { bracketRound: null, status: 'completed' },
        { bracketRound: 1, status: 'completed' },
      ]),
    ).not.toThrow();
    expect(() =>
      validateQualifyingKnockoutFinalization('knockout', [
        { bracketRound: 1, status: 'completed' },
      ]),
    ).not.toThrow();
  });

  it('creates a consolation match for the two eliminated teams', () => {
    const standings = [
      { teamId: 'seed-8', seed: 8, qualified: false },
      { teamId: 'seed-4', seed: 4, qualified: false },
    ];

    expect(buildQualifyingConsolationMatch(standings, 12)).toEqual({
      teamAId: 'seed-4',
      teamBId: 'seed-8',
      sequence: 12,
    });
  });

  it('resolves replacement quarter-final teams and playoff teams', () => {
    const standings = Array.from({ length: 10 }, (_, index) => ({
      teamId: `seed-${index + 1}`,
      seed: index + 1,
      scoreFor: 11,
      scoreAgainst: index + 1,
      wins: 1,
      losses: 0,
      winPercentage: 1,
      pointDifferential: 10 - index,
      qualified: index < 8,
    }));

    expect(resolveQualifyingKnockoutTeams(standings, [
      'seed-1',
      'seed-2',
      'seed-3',
      'seed-4',
      'seed-5',
      'seed-6',
      'seed-9',
      'seed-10',
    ])).toEqual({
      quarterFinalTeamIds: ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5', 'seed-6', 'seed-9', 'seed-10'],
      consolationTeamIds: ['seed-7', 'seed-8'],
    });
    expect(resolveQualifyingKnockoutTeams(standings)).toEqual({
      quarterFinalTeamIds: ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5', 'seed-6', 'seed-7', 'seed-8'],
      consolationTeamIds: ['seed-9', 'seed-10'],
    });
    expect(() => resolveQualifyingKnockoutTeams(standings, ['seed-1', 'seed-1'])).toThrow(/eight unique/i);
    expect(() => resolveQualifyingKnockoutTeams(standings, ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5', 'seed-6', 'seed-7', 'missing'])).toThrow(/unknown/i);
  });
});

describe('attendance rollback', () => {
  const matchStatuses = ['completed', 'pending', 'completed'] as const;

  it.each(['draw_published', 'in_progress'] as const)('allows %s sessions and counts discarded scores', (status) => {
    expect(planAttendanceRollback(status, matchStatuses)).toEqual({ matchCount: 3, scoredMatchCount: 2 });
  });

  it.each(['draft', 'finalized', 'voided'] as const)('rejects %s sessions', (status) => {
    expect(() => planAttendanceRollback(status, matchStatuses)).toThrow(/published or in progress/i);
  });
});

describe('quarter-final configuration return', () => {
  const matches = [
    { id: 'qualifier-1', bracketRound: null },
    { id: 'qualifier-2', bracketRound: null },
    { id: 'qualifier-3', bracketRound: null },
    { id: 'qualifier-4', bracketRound: null },
    { id: 'qualifier-5', bracketRound: null },
    { id: 'quarter-1', bracketRound: 1 },
    { id: 'semi-1', bracketRound: 2 },
    { id: 'final-1', bracketRound: 3 },
    { id: 'playoff-1', bracketRound: null },
  ];

  it('keeps qualifiers and deletes generated knockout and playoff matches', () => {
    expect(planQuarterFinalConfigReturn('qualifying_knockout', 'in_progress', matches)).toEqual({
      keptQualifierMatchIds: ['qualifier-1', 'qualifier-2', 'qualifier-3', 'qualifier-4', 'qualifier-5'],
      deletedMatchIds: ['quarter-1', 'semi-1', 'final-1', 'playoff-1'],
    });
  });

  it('rejects sessions without a generated bracket or with the wrong format', () => {
    expect(() => planQuarterFinalConfigReturn('round_robin', 'in_progress', matches)).toThrow(/qualifying knockout/i);
    expect(() => planQuarterFinalConfigReturn('qualifying_knockout', 'draft', matches)).toThrow(/published or in progress/i);
    expect(() => planQuarterFinalConfigReturn('qualifying_knockout', 'in_progress', matches.slice(0, 5))).toThrow(/generated bracket/i);
  });
});

describe('placement re-pairing', () => {
  const rows = [
    { id: 'source-1', matchKind: 'championship', placementGroup: null, status: 'completed', teamAId: 'team-1', teamBId: 'team-8', scoreA: 11, scoreB: 7, loserNextMatchId: 'place-1', loserToSlot: 'A' },
    { id: 'source-2', matchKind: 'championship', placementGroup: null, status: 'completed', teamAId: 'team-4', teamBId: 'team-5', scoreA: 8, scoreB: 11, loserNextMatchId: 'place-1', loserToSlot: 'B' },
    { id: 'place-1', matchKind: 'placement', placementGroup: 2, status: 'pending', teamAId: 'team-8', teamBId: 'team-4', scoreA: null, scoreB: null, loserNextMatchId: null, loserToSlot: null },
  ] as const;

  it('rewires the same resolved loser cohort in the requested order', () => {
    expect(planPlacementRepair(rows, 2, ['team-4', 'team-8'])).toEqual([
      { sourceMatchId: 'source-2', nextMatchId: 'place-1', slot: 'A', teamId: 'team-4' },
      { sourceMatchId: 'source-1', nextMatchId: 'place-1', slot: 'B', teamId: 'team-8' },
    ]);
  });

  it('rejects changed cohorts and placement groups that have started', () => {
    expect(() => planPlacementRepair(rows, 2, ['team-8', 'team-8'])).toThrow(/exact cohort/i);
    expect(() => planPlacementRepair(rows.map((row) => row.id === 'place-1' ? { ...row, status: 'completed' as const } : row), 2, ['team-8', 'team-4'])).toThrow(/already started/i);
  });
});

describe('configured draw', () => {
  const configuredPlayers = [
    { id: 'a1', name: 'A1', skill: 8, group: 'A' as const },
    { id: 'a2', name: 'A2', skill: 7, group: 'A' as const },
    { id: 'b1', name: 'B1', skill: 5, group: 'B' as const },
    { id: 'b2', name: 'B2', skill: 4, group: 'B' as const },
  ];
  const pairs = [
    { number: 4, groupAPlayerId: 'a1', groupBPlayerId: 'b2' },
    { number: 2, groupAPlayerId: 'a2', groupBPlayerId: 'b1' },
  ];

  it('builds numbered teams in number order and schedules every matchup', () => {
    const draw = buildConfiguredDraw(configuredPlayers, pairs);

    expect(draw.teams.map((team) => ({ number: team.number, ids: team.members.map((member) => member.id) }))).toEqual([
      { number: 2, ids: ['a2', 'b1'] },
      { number: 4, ids: ['a1', 'b2'] },
    ]);
    expect(draw.matches).toEqual([{ teamAIndex: 0, teamBIndex: 1, sequence: 1 }]);
  });

  it.each([
    ['duplicate pair numbers', [{ ...pairs[0] }, { ...pairs[1], number: 4 }]],
    ['reused players', [{ ...pairs[0] }, { ...pairs[1], groupAPlayerId: 'a1' }]],
    ['missing players', [pairs[0]]],
    ['wrong groups', [{ ...pairs[0], groupAPlayerId: 'b1' }, pairs[1]]],
  ])('rejects %s', (_label, invalidPairs) => {
    expect(() => buildConfiguredDraw(configuredPlayers, invalidPairs)).toThrow();
  });
});

describe('draw persistence rows', () => {
  it('builds bulk rows for a complete draw', () => {
    const participants = [
      { id: 'a1', name: 'A1', skill: 8, group: 'A' as const },
      { id: 'b1', name: 'B1', skill: 5, group: 'B' as const },
      { id: 'a2', name: 'A2', skill: 7, group: 'A' as const },
      { id: 'b2', name: 'B2', skill: 4, group: 'B' as const },
    ];
    const draw = {
      teams: [
        { members: [participants[0], participants[1]] as [typeof participants[0], typeof participants[1]] },
        { members: [participants[2], participants[3]] as [typeof participants[2], typeof participants[3]] },
      ],
      matches: [{ teamAIndex: 0, teamBIndex: 1, sequence: 1 }],
    };

    expect(buildDrawPersistenceRows('session-1', participants, draw)).toEqual({
      participants: participants.map((participant) => ({
        sessionId: 'session-1',
        playerId: participant.id,
        status: 'attendee',
        group: participant.group,
      })),
      teams: [{ sessionId: 'session-1', seed: 1 }, { sessionId: 'session-1', seed: 2 }],
      members: [
        { teamIndex: 0, sessionId: 'session-1', playerId: 'a1', group: 'A' },
        { teamIndex: 0, sessionId: 'session-1', playerId: 'b1', group: 'B' },
        { teamIndex: 1, sessionId: 'session-1', playerId: 'a2', group: 'A' },
        { teamIndex: 1, sessionId: 'session-1', playerId: 'b2', group: 'B' },
      ],
      matches: [{ teamAIndex: 0, teamBIndex: 1, sequence: 1 }],
    });
  });
});

const players = [
  { id: 'p1', name: 'One', skill: 10 },
  { id: 'p2', name: 'Two', skill: 8 },
  { id: 'p3', name: 'Three', skill: 5 },
  { id: 'p4', name: 'Four', skill: 2 },
];

describe('attendance grouping', () => {
  it('places the highest ranked half in A for either points or skill values', () => {
    expect(assignRankedGroups(players.map((player) => ({ ...player, rankingValue: player.skill })))).toEqual([
      { ...players[0], rankingValue: 10, group: 'A' },
      { ...players[1], rankingValue: 8, group: 'A' },
      { ...players[2], rankingValue: 5, group: 'B' },
      { ...players[3], rankingValue: 2, group: 'B' },
    ]);
  });

  it('breaks equal ranking values by name and then id', () => {
    const tied = [
      { id: 'p2', name: 'Beta', skill: 1, rankingValue: 50 },
      { id: 'p3', name: 'Alpha', skill: 1, rankingValue: 50 },
      { id: 'p1', name: 'Alpha', skill: 1, rankingValue: 50 },
      { id: 'p4', name: 'Delta', skill: 1, rankingValue: 40 },
    ];

    expect(assignRankedGroups(tied).map(({ id, group }) => ({ id, group }))).toEqual([
      { id: 'p1', group: 'A' },
      { id: 'p3', group: 'A' },
      { id: 'p2', group: 'B' },
      { id: 'p4', group: 'B' },
    ]);
  });
});

describe('draw generation', () => {
  it('pairs shuffled A and B players and schedules every unique team matchup', () => {
    const participants = assignRankedGroups(players.map((player) => ({ ...player, rankingValue: player.skill })));
    const draw = buildRoundRobinDraw(participants, () => 0);

    expect(draw.teams).toHaveLength(2);
    expect(draw.teams.flatMap((team) => team.members.map((member) => member.group))).toEqual([
      'A',
      'B',
      'A',
      'B',
    ]);
    expect(draw.matches).toEqual([{ teamAIndex: 0, teamBIndex: 1, sequence: 1 }]);
  });

  it('rejects unequal groups and sessions with fewer than two teams', () => {
    expect(() =>
      buildRoundRobinDraw(
        [
          { ...players[0], group: 'A' },
          { ...players[1], group: 'B' },
          { ...players[2], group: 'B' },
        ],
        () => 0,
      ),
    ).toThrow(/equal/i);
    expect(() =>
      buildRoundRobinDraw(
        [
          { ...players[0], group: 'A' },
          { ...players[1], group: 'B' },
        ],
        () => 0,
      ),
    ).toThrow(/two teams/i);
  });

  it('creates n choose 2 matches for three teams', () => {
    const sixPlayers = [
      ...players,
      { id: 'p5', name: 'Five', skill: 4 },
      { id: 'p6', name: 'Six', skill: 1 },
    ];
    expect(
      buildRoundRobinDraw(
        assignRankedGroups(sixPlayers.map((player) => ({ ...player, rankingValue: player.skill }))),
        () => 0,
      ).matches,
    ).toHaveLength(3);
  });
});

describe('scores and awards', () => {
  it('accepts integer scores from 0 to 99 and rejects ties', () => {
    expect(validateCompletedScore(21, 19)).toEqual({ scoreA: 21, scoreB: 19 });
    expect(() => validateCompletedScore(21, 21)).toThrow(/tie/i);
    expect(() => validateCompletedScore(100, 1)).toThrow(/0 and 99/i);
    expect(() => validateCompletedScore(2.5, 1)).toThrow(/integer/i);
  });

  it('awards every winner and loser using the session snapshot values', () => {
    expect(
      calculateMatchAwards({
        matchId: 'm1',
        teamAPlayerIds: ['p1', 'p2'],
        teamBPlayerIds: ['p3', 'p4'],
        scoreA: 21,
        scoreB: 17,
        winPoints: 150.5,
        lossPoints: 30.5,
      }),
    ).toEqual([
      { playerId: 'p1', points: 150.5, reason: 'match_win', matchId: 'm1' },
      { playerId: 'p2', points: 150.5, reason: 'match_win', matchId: 'm1' },
      { playerId: 'p3', points: 30.5, reason: 'match_loss', matchId: 'm1' },
      { playerId: 'p4', points: 30.5, reason: 'match_loss', matchId: 'm1' },
    ]);
  });
});
