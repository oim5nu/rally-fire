import { describe, expect, it } from 'vitest';
import { bracketStageLabel, groupKnockoutStages } from './KnockoutBracket';

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
});
