export interface SeasonRosterRemovalInput {
  inActiveSeasonRoster: boolean;
  activeSessionStatus: 'draft' | 'draw_published' | 'in_progress' | null;
  playerInActiveSession: boolean;
}

export interface SeasonRosterRemovalPlan {
  removeDraftParticipant: boolean;
}

export function planSeasonRosterRemoval(input: SeasonRosterRemovalInput): SeasonRosterRemovalPlan {
  if (!input.inActiveSeasonRoster) {
    throw new Error('Player is not in the active season roster.');
  }
  if (
    input.playerInActiveSession
    && (input.activeSessionStatus === 'draw_published' || input.activeSessionStatus === 'in_progress')
  ) {
    throw new Error('This player is in the current draw. Return to attendance before removing them from the roster.');
  }
  return {
    removeDraftParticipant: input.playerInActiveSession && input.activeSessionStatus === 'draft',
  };
}
