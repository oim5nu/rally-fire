import { describe, expect, it } from 'vitest';
import { countAttendeeGroups, sortPlayersByPoints } from './AdminDashboard';

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
