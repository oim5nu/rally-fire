import { describe, expect, it } from 'vitest';
import {
  buildManualPairPayload,
  countAttendeeGroups,
  createManualPairRows,
  createDefaultKnockoutSetup,
  isValidKnockoutSetup,
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
