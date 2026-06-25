import { describe, expect, it } from 'vitest';
import { planSeasonRosterRemoval } from './roster';

describe('season roster removal', () => {
  it('allows removing a player from the roster when no active draw uses them', () => {
    expect(planSeasonRosterRemoval({
      inActiveSeasonRoster: true,
      activeSessionStatus: null,
      playerInActiveSession: false,
    })).toEqual({ removeDraftParticipant: false });
  });

  it('removes a draft participant alongside the roster entry', () => {
    expect(planSeasonRosterRemoval({
      inActiveSeasonRoster: true,
      activeSessionStatus: 'draft',
      playerInActiveSession: true,
    })).toEqual({ removeDraftParticipant: true });
  });

  it.each(['draw_published', 'in_progress'] as const)('rejects removal from a %s session draw', (activeSessionStatus) => {
    expect(() => planSeasonRosterRemoval({
      inActiveSeasonRoster: true,
      activeSessionStatus,
      playerInActiveSession: true,
    })).toThrow('This player is in the current draw. Return to attendance before removing them from the roster.');
  });

  it('rejects players that are not in the active season roster', () => {
    expect(() => planSeasonRosterRemoval({
      inActiveSeasonRoster: false,
      activeSessionStatus: 'draft',
      playerInActiveSession: false,
    })).toThrow('Player is not in the active season roster.');
  });
});
