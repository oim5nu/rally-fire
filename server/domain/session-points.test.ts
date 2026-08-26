import { describe, expect, it } from 'vitest';
import {
  planSessionPoints,
  type SessionMatchRecord,
  type SessionPointRules,
  type SessionTeam,
} from './session-points.js';

const teams: SessionTeam[] = [
  { id: 'alpha', seed: 1, playerIds: ['a1', 'a2'] },
  { id: 'bravo', seed: 2, playerIds: ['b1', 'b2'] },
  { id: 'charlie', seed: 3, playerIds: ['c1', 'c2'] },
  { id: 'delta', seed: 4, playerIds: ['d1', 'd2'] },
  { id: 'echo', seed: 5, playerIds: ['e1', 'e2'] },
];

const rules: SessionPointRules = {
  winPoints: 3,
  lossPoints: 1,
  firstPlaceBonus: 5,
  secondPlaceBonus: 3,
  thirdPlaceBonus: 1,
  maxSessionPoints: 100,
};

function match(
  id: string,
  sequence: number,
  matchKind: SessionMatchRecord['matchKind'],
  teamAId: string | null,
  teamBId: string | null,
  scoreA: number | null,
  scoreB: number | null,
  metadata: Partial<SessionMatchRecord> = {},
): SessionMatchRecord {
  return {
    id,
    sequence,
    matchKind,
    teamAId,
    teamBId,
    scoreA,
    scoreB,
    nextMatchId: null,
    placementGroup: null,
    placementBestRank: null,
    placementWorstRank: null,
    ...metadata,
  };
}

describe('planSessionPoints', () => {
  it('ranks round robin by wins, differential, points scored, then seed', () => {
    const byWins = planSessionPoints({
      format: 'round_robin',
      teams: teams.slice(0, 3),
      matches: [
        match('m1', 1, 'round_robin', 'alpha', 'bravo', 21, 10),
        match('m2', 2, 'round_robin', 'alpha', 'charlie', 21, 10),
        match('m3', 3, 'round_robin', 'bravo', 'charlie', 21, 10),
      ],
      rules,
    });
    expect(byWins.teamSummaries.map(({ teamId, placement }) => [teamId, placement])).toEqual([
      ['alpha', 1], ['bravo', 2], ['charlie', 3],
    ]);

    const byDifferential = planSessionPoints({
      format: 'round_robin',
      teams: teams.slice(0, 3),
      matches: [
        match('m1', 1, 'round_robin', 'alpha', 'bravo', 21, 10),
        match('m2', 2, 'round_robin', 'bravo', 'charlie', 21, 18),
        match('m3', 3, 'round_robin', 'charlie', 'alpha', 21, 18),
      ],
      rules,
    });
    expect(byDifferential.teamSummaries.map(({ teamId }) => teamId)).toEqual(['alpha', 'charlie', 'bravo']);

    const byPointsScored = planSessionPoints({
      format: 'round_robin',
      teams: teams.slice(0, 3),
      matches: [
        match('m1', 1, 'round_robin', 'alpha', 'bravo', 21, 18),
        match('m2', 2, 'round_robin', 'bravo', 'charlie', 30, 26),
        match('m3', 3, 'round_robin', 'charlie', 'alpha', 21, 19),
      ],
      rules,
    });
    expect(byPointsScored.teamSummaries.map(({ teamId }) => teamId)).toEqual(['bravo', 'alpha', 'charlie']);

    const bySeed = planSessionPoints({
      format: 'round_robin',
      teams: [teams[2], teams[0]],
      matches: [],
      rules,
    });
    expect(bySeed.teamSummaries.map(({ teamId, placement }) => [teamId, placement])).toEqual([
      ['alpha', 1], ['charlie', 2],
    ]);
    expect(bySeed.teamSummaries.some(({ placement }) => placement === 3)).toBe(false);
  });

  it('applies below, equal, and above-cap totals and gives both players identical itemized awards', () => {
    const result = planSessionPoints({
      format: 'round_robin',
      teams: teams.slice(0, 3),
      matches: [
        match('m1', 1, 'round_robin', 'alpha', 'bravo', 21, 10),
        match('m2', 2, 'round_robin', 'alpha', 'charlie', 21, 10),
        match('m3', 3, 'round_robin', 'bravo', 'charlie', 21, 10),
      ],
      rules: { ...rules, maxSessionPoints: 7 },
    });

    expect(result.teamSummaries).toEqual([
      { teamId: 'alpha', placement: 1, rawPoints: 11, cappedPoints: 7, capAdjustment: -4 },
      { teamId: 'bravo', placement: 2, rawPoints: 7, cappedPoints: 7, capAdjustment: 0 },
      { teamId: 'charlie', placement: 3, rawPoints: 3, cappedPoints: 3, capAdjustment: 0 },
    ]);
    const awardsFor = (playerId: string) => result.playerAwards
      .filter((award) => award.playerId === playerId)
      .map(({ playerId: _playerId, ...award }) => award);
    expect(awardsFor('a1')).toEqual(awardsFor('a2'));
    expect(awardsFor('a1')).toEqual([
      { teamId: 'alpha', type: 'match_win', points: 3, matchId: 'm1' },
      { teamId: 'alpha', type: 'match_win', points: 3, matchId: 'm2' },
      { teamId: 'alpha', type: 'placement_bonus', points: 5, matchId: null },
      { teamId: 'alpha', type: 'session_cap_adjustment', points: -4, matchId: null },
    ]);
    for (const summary of result.teamSummaries) {
      for (const playerId of teams.find(({ id }) => id === summary.teamId)!.playerIds) {
        expect(result.playerAwards
          .filter((award) => award.playerId === playerId)
          .reduce((sum, award) => sum + award.points, 0)).toBe(summary.cappedPoints);
      }
    }
  });

  it('counts every match kind equally, including qualifiers and consolation, and awards knockout podium places', () => {
    const result = planSessionPoints({
      format: 'knockout',
      teams,
      matches: [
        match('rr', 1, 'round_robin', 'alpha', 'echo', 9, 4),
        match('q', 2, 'qualifier', 'bravo', 'echo', 9, 5),
        match('c', 3, 'consolation', 'delta', 'echo', 9, 6),
        match('third', 4, 'placement', 'bravo', 'delta', 9, 7, {
          placementGroup: 1,
          placementBestRank: 3,
          placementWorstRank: 4,
        }),
        match('final', 5, 'championship', 'alpha', 'charlie', 9, 8),
      ],
      rules: { ...rules, winPoints: 4, lossPoints: 2 },
    });

    expect(result.teamSummaries.map(({ teamId, placement }) => [teamId, placement])).toEqual([
      ['alpha', 1], ['charlie', 2], ['bravo', 3], ['delta', null], ['echo', null],
    ]);
    const matchAwards = result.playerAwards.filter(({ playerId, type }) => playerId.endsWith('1') && type.startsWith('match_'));
    expect(matchAwards.filter(({ type }) => type === 'match_win').every(({ points }) => points === 4)).toBe(true);
    expect(matchAwards.filter(({ type }) => type === 'match_loss').every(({ points }) => points === 2)).toBe(true);
    expect(new Set(matchAwards.map(({ matchId }) => matchId))).toEqual(new Set(['rr', 'q', 'c', 'third', 'final']));
    expect(result.playerAwards).toContainEqual({
      playerId: 'b1', teamId: 'bravo', type: 'placement_bonus', points: 1, matchId: null,
    });
  });

  it('derives championship placements for qualifying knockout sessions without inventing third place', () => {
    const result = planSessionPoints({
      format: 'qualifying_knockout',
      teams: teams.slice(0, 3),
      matches: [
        match('q', 1, 'qualifier', 'alpha', 'bravo', 11, 8, { nextMatchId: 'final' }),
        match('final', 2, 'championship', 'alpha', 'charlie', 11, 9),
      ],
      rules,
    });
    expect(result.teamSummaries.map(({ teamId, placement }) => [teamId, placement])).toEqual([
      ['alpha', 1], ['charlie', 2], ['bravo', null],
    ]);
  });

  it('keeps configurable zero loss points itemized', () => {
    const result = planSessionPoints({
      format: 'knockout',
      teams: teams.slice(0, 2),
      matches: [match('final', 1, 'championship', 'alpha', 'bravo', 5, 2)],
      rules: { ...rules, lossPoints: 0 },
    });
    expect(result.playerAwards).toContainEqual({
      playerId: 'b1', teamId: 'bravo', type: 'match_loss', points: 0, matchId: 'final',
    });
  });

  it('normalizes fractional point arithmetic at the cap boundary', () => {
    const result = planSessionPoints({
      format: 'knockout',
      teams: teams.slice(0, 4),
      matches: [
        match('m1', 1, 'consolation', 'alpha', 'bravo', 5, 2),
        match('m2', 2, 'consolation', 'alpha', 'charlie', 5, 2),
        match('m3', 3, 'consolation', 'alpha', 'delta', 5, 2),
      ],
      rules: {
        winPoints: 0.1,
        lossPoints: 0,
        firstPlaceBonus: 0,
        secondPlaceBonus: 0,
        thirdPlaceBonus: 0,
        maxSessionPoints: 0.3,
      },
    });

    expect(result.teamSummaries.find(({ teamId }) => teamId === 'alpha')).toEqual({
      teamId: 'alpha', placement: null, rawPoints: 0.3, cappedPoints: 0.3, capAdjustment: 0,
    });
    expect(result.playerAwards.filter(({ playerId }) => playerId === 'a1')).toEqual([
      { playerId: 'a1', teamId: 'alpha', type: 'match_win', points: 0.1, matchId: 'm1' },
      { playerId: 'a1', teamId: 'alpha', type: 'match_win', points: 0.1, matchId: 'm2' },
      { playerId: 'a1', teamId: 'alpha', type: 'match_win', points: 0.1, matchId: 'm3' },
    ]);
    expect(result.teamSummaries.flatMap(({ rawPoints, cappedPoints, capAdjustment }) => [
      rawPoints, cappedPoints, capAdjustment,
    ]).every((points) => Number.isInteger(points * 10))).toBe(true);
    expect(result.playerAwards.every(({ points }) => Number.isInteger(points * 10))).toBe(true);
  });

  it('splits an aggregate cap adjustment into deterministic numeric-safe tenths chunks', () => {
    const databaseMaximum = 99_999_999_999.9;
    const result = planSessionPoints({
      format: 'round_robin',
      teams: teams.slice(0, 3),
      matches: [
        match('m1', 1, 'round_robin', 'alpha', 'bravo', 5, 2),
        match('m2', 2, 'round_robin', 'alpha', 'charlie', 5, 2),
        match('m3', 3, 'round_robin', 'bravo', 'charlie', 5, 2),
      ],
      rules: {
        winPoints: databaseMaximum,
        lossPoints: 0,
        firstPlaceBonus: 0,
        secondPlaceBonus: 0,
        thirdPlaceBonus: 0,
        maxSessionPoints: 0.1,
      },
    });

    expect(result.teamSummaries[0]).toEqual({
      teamId: 'alpha',
      placement: 1,
      rawPoints: 199_999_999_999.8,
      cappedPoints: 0.1,
      capAdjustment: -199_999_999_999.7,
    });
    const awardsFor = (playerId: string) => result.playerAwards
      .filter((award) => award.playerId === playerId)
      .map(({ playerId: _playerId, ...award }) => award);
    expect(awardsFor('a1')).toEqual(awardsFor('a2'));
    const capAwards = awardsFor('a1').filter(({ type }) => type === 'session_cap_adjustment');
    expect(capAwards).toEqual([
      { teamId: 'alpha', type: 'session_cap_adjustment', points: -99_999_999_999.9, matchId: null },
      { teamId: 'alpha', type: 'session_cap_adjustment', points: -99_999_999_999.8, matchId: null },
    ]);
    expect(capAwards.every(({ points }) => Math.abs(points) <= databaseMaximum)).toBe(true);
    expect(capAwards.reduce((sum, { points }) => sum + Math.round(points * 10), 0))
      .toBe(Math.round(result.teamSummaries[0].capAdjustment * 10));
  });

  it.each([
    ['a missing team', match('bad', 1, 'round_robin', null, 'bravo', 5, 2)],
    ['an unknown team', match('bad', 1, 'round_robin', 'outside', 'bravo', 5, 2)],
    ['an incomplete score', match('bad', 1, 'round_robin', 'alpha', 'bravo', null, 2)],
    ['a tied score', match('bad', 1, 'round_robin', 'alpha', 'bravo', 2, 2)],
  ])('rejects completed matches with %s', (_label, invalidMatch) => {
    expect(() => planSessionPoints({
      format: 'round_robin', teams: teams.slice(0, 2), matches: [invalidMatch], rules,
    })).toThrow();
  });

  it.each([
    ['a negative score', -1, 2],
    ['a fractional score', 2.5, 1],
    ['a score above 99', 100, 1],
  ])('rejects completed matches with %s', (_label, scoreA, scoreB) => {
    expect(() => planSessionPoints({
      format: 'round_robin',
      teams: teams.slice(0, 2),
      matches: [match('bad', 1, 'round_robin', 'alpha', 'bravo', scoreA, scoreB)],
      rules,
    })).toThrow();
  });

  it('rejects duplicate team IDs', () => {
    expect(() => planSessionPoints({
      format: 'round_robin',
      teams: [teams[0], { id: 'alpha', seed: 2, playerIds: ['x1', 'x2'] }],
      matches: [],
      rules,
    })).toThrow(/team id/i);
  });

  it.each([
    ['within one team', [
      { id: 'alpha', seed: 1, playerIds: ['shared', 'shared'] },
      teams[1],
    ]],
    ['across teams', [
      { id: 'alpha', seed: 1, playerIds: ['a1', 'shared'] },
      { id: 'bravo', seed: 2, playerIds: ['b1', 'shared'] },
    ]],
  ] as const)('rejects duplicate player IDs %s', (_label, invalidTeams) => {
    expect(() => planSessionPoints({
      format: 'round_robin',
      teams: invalidTeams,
      matches: [],
      rules,
    })).toThrow(/player id/i);
  });

  it.each([
    ['winPoints', -1],
    ['lossPoints', -1],
    ['firstPlaceBonus', -1],
    ['secondPlaceBonus', -1],
    ['thirdPlaceBonus', -1],
    ['maxSessionPoints', 0],
  ] as const)('rejects invalid %s', (name, value) => {
    expect(() => planSessionPoints({
      format: 'round_robin',
      teams: teams.slice(0, 2),
      matches: [],
      rules: { ...rules, [name]: value },
    })).toThrow();
  });
});
