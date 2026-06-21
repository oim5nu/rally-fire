import { describe, expect, it } from 'vitest';
import {
  assignSkillGroups,
  buildRoundRobinDraw,
  calculateMatchAwards,
  validateCompletedScore,
} from './competition';

const players = [
  { id: 'p1', name: 'One', skill: 10 },
  { id: 'p2', name: 'Two', skill: 8 },
  { id: 'p3', name: 'Three', skill: 5 },
  { id: 'p4', name: 'Four', skill: 2 },
];

describe('attendance grouping', () => {
  it('places the strongest half in A and the remaining half in B', () => {
    expect(assignSkillGroups(players)).toEqual([
      { ...players[0], group: 'A' },
      { ...players[1], group: 'A' },
      { ...players[2], group: 'B' },
      { ...players[3], group: 'B' },
    ]);
  });
});

describe('draw generation', () => {
  it('pairs shuffled A and B players and schedules every unique team matchup', () => {
    const participants = assignSkillGroups(players);
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
    expect(buildRoundRobinDraw(assignSkillGroups(sixPlayers), () => 0).matches).toHaveLength(3);
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
        winPoints: 150,
        lossPoints: 30,
      }),
    ).toEqual([
      { playerId: 'p1', points: 150, reason: 'match_win', matchId: 'm1' },
      { playerId: 'p2', points: 150, reason: 'match_win', matchId: 'm1' },
      { playerId: 'p3', points: 30, reason: 'match_loss', matchId: 'm1' },
      { playerId: 'p4', points: 30, reason: 'match_loss', matchId: 'm1' },
    ]);
  });
});
