import { describe, expect, it } from 'vitest';
import {
  assignRankedGroups,
  buildConfiguredDraw,
  buildDrawPersistenceRows,
  buildRoundRobinDraw,
  calculateMatchAwards,
  validateCompletedScore,
} from './competition';

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
