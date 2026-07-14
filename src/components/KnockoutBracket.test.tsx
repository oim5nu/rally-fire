// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import KnockoutBracket, { bracketStageLabel, groupKnockoutStages, groupTournamentBrackets, placementGroupLabel } from './KnockoutBracket';

describe('knockout bracket presentation', () => {
  it('groups matches into ordered stage columns', () => {
    const matches = [
      { id: 'final', bracketRound: 3, bracketPosition: 0 },
      { id: 'prelim', bracketRound: 0, bracketPosition: 0 },
      { id: 'semi-2', bracketRound: 2, bracketPosition: 1 },
      { id: 'semi-1', bracketRound: 2, bracketPosition: 0 },
    ];
    expect(groupKnockoutStages(matches).map((stage) => ({
      round: stage.round,
      ids: stage.matches.map((match) => match.id),
    }))).toEqual([
      { round: 0, ids: ['prelim'] },
      { round: 2, ids: ['semi-1', 'semi-2'] },
      { round: 3, ids: ['final'] },
    ]);
  });

  it('labels preliminary, standard, and final columns', () => {
    expect(bracketStageLabel(0, 2)).toBe('Preliminary');
    expect(bracketStageLabel(1, 8)).toBe('Round of 16');
    expect(bracketStageLabel(1, 4)).toBe('Quarterfinal');
    expect(bracketStageLabel(2, 2)).toBe('Semifinal');
    expect(bracketStageLabel(3, 1)).toBe('Final');
  });

  it('separates championship and ordered placement brackets', () => {
    const matches = [
      { id: 'fifth', matchKind: 'placement', placementGroup: 2, placementBestRank: 5, placementWorstRank: 8, bracketRound: 1, bracketPosition: 0 },
      { id: 'main', matchKind: 'championship', placementGroup: null, placementBestRank: null, placementWorstRank: null, bracketRound: 1, bracketPosition: 0 },
      { id: 'third', matchKind: 'placement', placementGroup: 1, placementBestRank: 3, placementWorstRank: 4, bracketRound: 0, bracketPosition: 0 },
    ];

    const grouped = groupTournamentBrackets(matches);
    expect(grouped.championship.map((match) => match.id)).toEqual(['main']);
    expect(grouped.placements.map((group) => ({ id: group.id, ids: group.matches.map((match) => match.id) }))).toEqual([
      { id: 1, ids: ['third'] },
      { id: 2, ids: ['fifth'] },
    ]);
    expect(placementGroupLabel(3, 4)).toBe('3rd / 4th place');
    expect(placementGroupLabel(5, 8)).toBe('5th–8th place');
  });

  it('renders championship and placement sections as separate public brackets', () => {
    const teams = [
      { id: 'team-1', seed: 1, members: [{ name: 'Alpha / One' }] },
      { id: 'team-2', seed: 2, members: [{ name: 'Beta / Two' }] },
    ];
    const base = { sequence: 1, teamAId: 'team-1', teamBId: 'team-2', scoreA: null, scoreB: null, court: null, status: 'pending' as const, bracketRound: 0, bracketPosition: 0 };
    render(<KnockoutBracket teams={teams} matches={[
      { ...base, id: 'main', matchKind: 'championship', placementGroup: null, placementBestRank: null, placementWorstRank: null },
      { ...base, id: 'third', sequence: 2, matchKind: 'placement', placementGroup: 1, placementBestRank: 3, placementWorstRank: 4 },
    ]} />);

    expect(screen.getByRole('region', { name: 'Championship bracket' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '3rd / 4th place' })).toBeTruthy();
  });
});
