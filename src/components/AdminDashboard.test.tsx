import { describe, expect, it, vi } from 'vitest';
import {
  buildDeleteRosterPlayerRequest,
  buildArchiveSeasonRequest,
  buildBulkPointAdjustmentPayload,
  buildReturnToQuarterFinalConfigRequest,
  buildPlacementRepairRequest,
  buildQualifyingStandings,
  buildManualPairPayload,
  countAttendeeGroups,
  createManualPairRows,
  createDefaultKnockoutSetup,
  createDefaultQualifyingMatchSetup,
  createQualifyingKnockoutSetup,
  createDefaultQuarterFinalTeamIds,
  getAvailableQuarterFinalTeamIds,
  getQuarterFinalPlayoffTeams,
  getQualifyingConsolationTeams,
  getEditablePlacementGroups,
  isValidQuarterFinalTeamSelection,
  isValidQualifyingMatchSetup,
  isValidKnockoutSetup,
  shouldRemoveRosterPlayer,
  shouldArchiveSeason,
  shouldReturnToQuarterFinalConfig,
  shouldShowQuarterFinalConfigReturn,
  splitQualifyingKnockoutMatches,
  sortPlayersByPoints,
} from './AdminDashboard';

describe('countAttendeeGroups', () => {
  it('counts selected manual groups and automatic attendees', () => {
    const selectedPlayers = new Set(['a-player', 'b-player', 'auto-player']);
    const groupOverrides = {
      'a-player': 'A',
      'b-player': 'B',
      'unselected-player': 'A',
    } as const;

    expect(countAttendeeGroups(selectedPlayers, groupOverrides)).toEqual({
      attendees: 3,
      groupA: 1,
      groupB: 1,
      auto: 1,
    });
  });
});

describe('sortPlayersByPoints', () => {
  it('sorts by points descending and name ascending without mutating the source', () => {
    const players = [
      { id: 'low', name: 'Zoe', displayRating: 'B2', clubSkill: 4, points: 10, active: true },
      { id: 'tie-z', name: 'Zara', displayRating: 'A2', clubSkill: 7, points: 20, active: true },
      { id: 'highest', name: 'Aaron', displayRating: 'A1', clubSkill: 8, points: 30, active: false },
      { id: 'tie-a', name: 'Amy', displayRating: 'A2', clubSkill: 7, points: 20, active: true },
    ];
    const originalOrder = players.map((player) => player.id);

    expect(sortPlayersByPoints(players).map((player) => player.id)).toEqual([
      'highest',
      'tie-a',
      'tie-z',
      'low',
    ]);
    expect(players.map((player) => player.id)).toEqual(originalOrder);
  });
});

describe('manual pairing', () => {
  it('creates numbered rows from equally sized A and B groups', () => {
    expect(createManualPairRows(['a1', 'a2'], ['b1', 'b2'])).toEqual([
      { number: '1', groupAPlayerId: 'a1', groupBPlayerId: 'b1' },
      { number: '2', groupAPlayerId: 'a2', groupBPlayerId: 'b2' },
    ]);
  });

  it('builds a payload only when every player and pair number is unique', () => {
    const rows = createManualPairRows(['a1', 'a2'], ['b1', 'b2']);
    expect(buildManualPairPayload(rows, ['a1', 'a2'], ['b1', 'b2'])).toEqual([
      { number: 1, groupAPlayerId: 'a1', groupBPlayerId: 'b1' },
      { number: 2, groupAPlayerId: 'a2', groupBPlayerId: 'b2' },
    ]);
    expect(buildManualPairPayload([{ ...rows[0] }, { ...rows[1], number: '1' }], ['a1', 'a2'], ['b1', 'b2'])).toBeNull();
    expect(buildManualPairPayload([{ ...rows[0] }, { ...rows[1], groupAPlayerId: 'a1' }], ['a1', 'a2'], ['b1', 'b2'])).toBeNull();
  });
});

describe('knockout setup', () => {
  it('creates ten-team preliminary and main-slot defaults', () => {
    const setup = createDefaultKnockoutSetup(10);
    expect(setup.preliminaryPairs).toEqual([[6, 9], [7, 8]]);
    expect(setup.mainSources).toHaveLength(8);
    expect(isValidKnockoutSetup(10, setup)).toBe(true);
  });

  it('rejects repeated team and preliminary sources', () => {
    const setup = createDefaultKnockoutSetup(6);
    expect(isValidKnockoutSetup(6, {
      ...setup,
      mainSources: setup.mainSources.map((source, index) => index === 1 ? setup.mainSources[0] : source),
    })).toBe(false);
  });
});

describe('placement pairing editor', () => {
  const placementMatches = [
    { id: 'c1', sequence: 1, teamAId: 'team-1', teamBId: 'team-8', scoreA: 11, scoreB: 7, court: null, status: 'completed' as const, bracketRound: 1, bracketPosition: 0, matchKind: 'championship' as const, placementGroup: null, placementBestRank: null, placementWorstRank: null, loserNextMatchId: 'p1', loserToSlot: 'A' as const },
    { id: 'c2', sequence: 2, teamAId: 'team-4', teamBId: 'team-5', scoreA: 8, scoreB: 11, court: null, status: 'completed' as const, bracketRound: 1, bracketPosition: 1, matchKind: 'championship' as const, placementGroup: null, placementBestRank: null, placementWorstRank: null, loserNextMatchId: 'p1', loserToSlot: 'B' as const },
    { id: 'c3', sequence: 3, teamAId: 'team-2', teamBId: 'team-7', scoreA: 11, scoreB: 6, court: null, status: 'completed' as const, bracketRound: 1, bracketPosition: 2, matchKind: 'championship' as const, placementGroup: null, placementBestRank: null, placementWorstRank: null, loserNextMatchId: 'p2', loserToSlot: 'A' as const },
    { id: 'c4', sequence: 4, teamAId: 'team-3', teamBId: 'team-6', scoreA: 11, scoreB: 9, court: null, status: 'completed' as const, bracketRound: 1, bracketPosition: 3, matchKind: 'championship' as const, placementGroup: null, placementBestRank: null, placementWorstRank: null, loserNextMatchId: 'p2', loserToSlot: 'B' as const },
    { id: 'p1', sequence: 8, teamAId: 'team-8', teamBId: 'team-4', scoreA: null, scoreB: null, court: null, status: 'pending' as const, bracketRound: 0, bracketPosition: 0, matchKind: 'placement' as const, placementGroup: 2, placementBestRank: 5, placementWorstRank: 8 },
    { id: 'p2', sequence: 9, teamAId: 'team-7', teamBId: 'team-6', scoreA: null, scoreB: null, court: null, status: 'pending' as const, bracketRound: 0, bracketPosition: 1, matchKind: 'placement' as const, placementGroup: 2, placementBestRank: 5, placementWorstRank: 8 },
  ];

  it('offers a resolved unscored cohort and builds its API request', () => {
    expect(getEditablePlacementGroups(placementMatches)).toEqual([
      { placementGroup: 2, bestRank: 5, worstRank: 8, teamIds: ['team-8', 'team-4', 'team-7', 'team-6'] },
    ]);
    expect(buildPlacementRepairRequest('session-1', 2, ['team-4', 'team-8'])).toEqual({
      method: 'POST',
      body: JSON.stringify({ action: 're_pair_placement', sessionId: 'session-1', placementGroup: 2, teamIds: ['team-4', 'team-8'] }),
    });
  });

  it('hides a cohort after placement scoring starts', () => {
    expect(getEditablePlacementGroups(placementMatches.map((match) => match.id === 'p1' ? { ...match, status: 'completed' as const } : match))).toEqual([]);
  });

  it('does not offer a direct placement match without championship loser routes', () => {
    expect(getEditablePlacementGroups(placementMatches.filter((match) => match.matchKind === 'placement'))).toEqual([]);
  });
});

describe('qualifying knockout setup', () => {
  it('creates five configurable qualifying matchups for ten teams', () => {
    expect(createDefaultQualifyingMatchSetup(10)).toEqual([[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]);
  });

  it('requires every qualifying team exactly once', () => {
    expect(isValidQualifyingMatchSetup(10, [[4, 9], [0, 2], [1, 8], [3, 7], [5, 6]])).toBe(true);
    expect(isValidQualifyingMatchSetup(10, [[0, 1], [2, 3], [4, 5], [6, 7], [8, 8]])).toBe(false);
  });

  it('creates an eight-team main bracket setup for qualifiers', () => {
    const setup = createQualifyingKnockoutSetup();

    expect(setup.preliminaryPairs).toEqual([]);
    expect(setup.mainSources).toHaveLength(8);
    expect(isValidKnockoutSetup(8, setup)).toBe(true);
  });

  it('builds qualifier standings with the bottom two eliminated', () => {
    const teams = Array.from({ length: 10 }, (_, index) => ({
      id: `team-${index + 1}`,
      seed: index + 1,
      members: [{ playerId: `p${index}a`, name: `Team ${index + 1}A`, group: 'A' as const }],
    }));
    const matches = [
      { id: 'm1', sequence: 1, teamAId: 'team-1', teamBId: 'team-2', scoreA: 11, scoreB: 8, court: null, status: 'completed' as const, bracketRound: null, bracketPosition: null },
      { id: 'm2', sequence: 2, teamAId: 'team-3', teamBId: 'team-4', scoreA: 11, scoreB: 3, court: null, status: 'completed' as const, bracketRound: null, bracketPosition: null },
      { id: 'm3', sequence: 3, teamAId: 'team-5', teamBId: 'team-6', scoreA: 11, scoreB: 9, court: null, status: 'completed' as const, bracketRound: null, bracketPosition: null },
      { id: 'm4', sequence: 4, teamAId: 'team-7', teamBId: 'team-8', scoreA: 11, scoreB: 6, court: null, status: 'completed' as const, bracketRound: null, bracketPosition: null },
      { id: 'm5', sequence: 5, teamAId: 'team-9', teamBId: 'team-10', scoreA: 12, scoreB: 10, court: null, status: 'completed' as const, bracketRound: null, bracketPosition: null },
    ];

    expect(buildQualifyingStandings(teams, matches).map((standing) => ({
      seed: standing.seed,
      qualified: standing.qualified,
    }))).toEqual([
      { seed: 3, qualified: true },
      { seed: 7, qualified: true },
      { seed: 1, qualified: true },
      { seed: 9, qualified: true },
      { seed: 5, qualified: true },
      { seed: 10, qualified: true },
      { seed: 6, qualified: true },
      { seed: 2, qualified: true },
      { seed: 8, qualified: false },
      { seed: 4, qualified: false },
    ]);
  });

  it('keeps the consolation match separate from qualifying standings', () => {
    const matches = Array.from({ length: 13 }, (_, index) => ({
      id: `m${index + 1}`,
      sequence: index + 1,
      teamAId: `team-${index + 1}`,
      teamBId: `team-${index + 2}`,
      scoreA: null,
      scoreB: null,
      court: null,
      status: 'pending' as const,
      bracketRound: index < 6 ? null : 1,
      bracketPosition: index < 6 ? null : index - 5,
    }));

    expect(splitQualifyingKnockoutMatches(matches)).toEqual({
      qualifierMatches: matches.slice(0, 5),
      consolationMatches: [matches[5]],
      bracketMatches: matches.slice(6),
    });
  });

  it('finds the two eliminated teams for the consolation playoff preview', () => {
    const standings = [
      { seed: 1, qualified: true },
      { seed: 2, qualified: true },
      { seed: 5, qualified: false },
      { seed: 9, qualified: false },
    ];

    expect(getQualifyingConsolationTeams(standings as ReturnType<typeof buildQualifyingStandings>).map((standing) => standing.seed)).toEqual([5, 9]);
  });

  it('allows eliminated teams as quarter-final replacements', () => {
    const standings = Array.from({ length: 10 }, (_, index) => ({
      team: { id: `team-${index + 1}`, seed: index + 1, members: [] },
      seed: index + 1,
      qualified: index < 8,
    }));
    const selected = createDefaultQuarterFinalTeamIds(standings as ReturnType<typeof buildQualifyingStandings>);

    expect(selected).toEqual(['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6', 'team-7', 'team-8']);
    expect(getAvailableQuarterFinalTeamIds(standings as ReturnType<typeof buildQualifyingStandings>)).toEqual([
      'team-1',
      'team-2',
      'team-3',
      'team-4',
      'team-5',
      'team-6',
      'team-7',
      'team-8',
      'team-9',
      'team-10',
    ]);
    expect(isValidQuarterFinalTeamSelection(standings as ReturnType<typeof buildQualifyingStandings>, ['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6', 'team-9', 'team-10'])).toBe(true);
    expect(isValidQuarterFinalTeamSelection(standings as ReturnType<typeof buildQualifyingStandings>, ['team-1', 'team-1', 'team-3', 'team-4', 'team-5', 'team-6', 'team-9', 'team-10'])).toBe(false);
  });

  it('previews the playoff from teams not selected for quarter-finals', () => {
    const standings = Array.from({ length: 10 }, (_, index) => ({
      team: { id: `team-${index + 1}`, seed: index + 1, members: [] },
      seed: index + 1,
      qualified: index < 8,
    }));

    expect(getQuarterFinalPlayoffTeams(
      standings as ReturnType<typeof buildQualifyingStandings>,
      ['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6', 'team-9', 'team-10'],
    ).map((standing) => standing.team.id)).toEqual(['team-7', 'team-8']);
  });
});

describe('season roster delete', () => {
  it('does not continue when the confirmation is cancelled', () => {
    const confirmRemoval = vi.fn().mockReturnValue(false);

    expect(shouldRemoveRosterPlayer(confirmRemoval)).toBe(false);
    expect(confirmRemoval).toHaveBeenCalledWith('Remove this player from the active season roster? History will be kept.');
  });

  it('builds the active roster delete request', () => {
    expect(buildDeleteRosterPlayerRequest('player-1')).toEqual({
      method: 'DELETE',
      body: JSON.stringify({ playerId: 'player-1' }),
    });
  });
});

describe('season archive', () => {
  it('does not continue when the confirmation is cancelled', () => {
    const confirmArchive = vi.fn().mockReturnValue(false);

    expect(shouldArchiveSeason(confirmArchive)).toBe(false);
    expect(confirmArchive).toHaveBeenCalledWith('Finalize and archive this season? Active draft or live sessions must be finished first.');
  });

  it('builds the archive season request with an end timestamp', () => {
    expect(buildArchiveSeasonRequest('season-1', '2026-06-26T01:23:45.000Z')).toEqual({
      method: 'PATCH',
      body: JSON.stringify({
        seasonId: 'season-1',
        status: 'archived',
        endsAt: '2026-06-26T01:23:45.000Z',
      }),
    });
  });
});

describe('bulk point adjustments', () => {
  it('builds a bulk adjustment payload from non-zero rows only', () => {
    expect(buildBulkPointAdjustmentPayload(
      [
        { playerId: 'player-1', points: '2.5' },
        { playerId: 'player-2', points: '' },
        { playerId: 'player-3', points: '0' },
        { playerId: 'player-4', points: '-1' },
      ],
      'Correction after review',
      'bulk-key-1',
    )).toEqual({
      adjustments: [
        { playerId: 'player-1', points: 2.5 },
        { playerId: 'player-4', points: -1 },
      ],
      notes: 'Correction after review',
      idempotencyKey: 'bulk-key-1',
    });
  });

  it('requires a reason and at least one non-zero adjustment', () => {
    expect(buildBulkPointAdjustmentPayload([{ playerId: 'player-1', points: '1' }], ' ', 'bulk-key-1')).toBeNull();
    expect(buildBulkPointAdjustmentPayload([{ playerId: 'player-1', points: '' }], 'Correction', 'bulk-key-1')).toBeNull();
    expect(buildBulkPointAdjustmentPayload([{ playerId: 'player-1', points: '0' }], 'Correction', 'bulk-key-1')).toBeNull();
  });
});

describe('quarter-final configuration return', () => {
  it('shows the return action only after a qualifying knockout bracket is generated', () => {
    expect(shouldShowQuarterFinalConfigReturn('qualifying_knockout', [
      { id: 'qualifier', sequence: 1, teamAId: 'a', teamBId: 'b', scoreA: 11, scoreB: 8, court: null, status: 'completed' as const, bracketRound: null, bracketPosition: null },
      { id: 'quarter', sequence: 6, teamAId: 'c', teamBId: 'd', scoreA: null, scoreB: null, court: null, status: 'pending' as const, bracketRound: 1, bracketPosition: 0 },
    ])).toBe(true);
    expect(shouldShowQuarterFinalConfigReturn('qualifying_knockout', [
      { id: 'qualifier', sequence: 1, teamAId: 'a', teamBId: 'b', scoreA: 11, scoreB: 8, court: null, status: 'completed' as const, bracketRound: null, bracketPosition: null },
    ])).toBe(false);
    expect(shouldShowQuarterFinalConfigReturn('round_robin', [
      { id: 'match', sequence: 1, teamAId: 'a', teamBId: 'b', scoreA: null, scoreB: null, court: null, status: 'pending' as const, bracketRound: 1, bracketPosition: 0 },
    ])).toBe(false);
  });

  it('confirms before returning and builds the request', () => {
    const confirmReturn = vi.fn().mockReturnValue(false);

    expect(shouldReturnToQuarterFinalConfig(confirmReturn)).toBe(false);
    expect(confirmReturn).toHaveBeenCalledWith('Return to quarter-final configuration? Current knockout/playoff matches and scores will be deleted.');
    expect(buildReturnToQuarterFinalConfigRequest('session-1')).toEqual({
      method: 'POST',
      body: JSON.stringify({ action: 'return_to_quarter_final_config', sessionId: 'session-1' }),
    });
  });
});
