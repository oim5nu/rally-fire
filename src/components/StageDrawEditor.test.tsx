// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRequest } from '../lib/api';
import {
  StageDrawEditor,
  buildAdjustStageDrawRequest,
  discoverEditableStages,
  moveRoundRobinMatch,
  swapRoundRobinSides,
  validateStageDraft,
  type StageDrawMatch,
  type StageKey,
  type StageSnapshot,
} from './StageDrawEditor';

vi.mock('../lib/api', () => ({
  adminRequest: vi.fn(),
}));

const mockedAdminRequest = vi.mocked(adminRequest);

const roundRobinStage: StageKey = {
  matchKind: 'round_robin',
  bracketRound: null,
  placementGroup: null,
};

const championshipStage: StageKey = {
  matchKind: 'championship',
  bracketRound: 1,
  placementGroup: null,
};

function match(overrides: Partial<StageDrawMatch> & Pick<StageDrawMatch, 'id' | 'sequence'>): StageDrawMatch {
  return {
    id: overrides.id,
    sequence: overrides.sequence,
    teamAId: 'team-1',
    teamBId: 'team-2',
    status: 'pending',
    matchKind: 'round_robin',
    bracketRound: null,
    placementGroup: null,
    ...overrides,
  };
}

const teams = Array.from({ length: 4 }, (_, index) => ({
  id: `team-${index + 1}`,
  seed: index + 1,
  members: [{ name: `Team ${index + 1}` }],
}));

describe('discoverEditableStages', () => {
  it('groups resolved pending matches by the exact stage key for every supported kind', () => {
    const matches = [
      match({ id: 'rr-2', sequence: 2, teamAId: 'team-3', teamBId: 'team-4' }),
      match({ id: 'rr-1', sequence: 1 }),
      match({ id: 'qualifier', sequence: 3, matchKind: 'qualifier' }),
      match({ id: 'quarterfinal', sequence: 4, matchKind: 'championship', bracketRound: 1 }),
      match({ id: 'fifth-place', sequence: 5, matchKind: 'placement', bracketRound: 0, placementGroup: 2 }),
    ];

    expect(discoverEditableStages(matches).map((stage) => ({
      key: stage.key,
      matchIds: stage.matches.map((entry) => entry.id),
    }))).toEqual([
      { key: roundRobinStage, matchIds: ['rr-1', 'rr-2'] },
      { key: { matchKind: 'qualifier', bracketRound: null, placementGroup: null }, matchIds: ['qualifier'] },
      { key: championshipStage, matchIds: ['quarterfinal'] },
      { key: { matchKind: 'placement', bracketRound: 0, placementGroup: 2 }, matchIds: ['fifth-place'] },
    ]);
  });

  it('hides a whole stage when any match has started or has an unresolved team', () => {
    const matches = [
      match({ id: 'rr-pending', sequence: 1 }),
      match({ id: 'rr-started', sequence: 2, status: 'completed' }),
      match({ id: 'qualifier-unresolved', sequence: 3, matchKind: 'qualifier', teamBId: null }),
      match({ id: 'final', sequence: 4, matchKind: 'championship', bracketRound: 3 }),
    ];

    expect(discoverEditableStages(matches).map((stage) => stage.matches.map((entry) => entry.id))).toEqual([
      ['final'],
    ]);
  });
});

describe('stage snapshots and validation', () => {
  const expected: StageSnapshot[] = [
    { matchId: 'match-1', teamAId: 'team-1', teamBId: 'team-2', sequence: 8 },
    { matchId: 'match-2', teamAId: 'team-3', teamBId: 'team-4', sequence: 9 },
  ];

  it('builds a request with the captured current layout and complete desired layout', () => {
    const desired = [
      { ...expected[0], teamBId: 'team-4' },
      { ...expected[1], teamBId: 'team-2' },
    ];

    expect(buildAdjustStageDrawRequest('session-1', championshipStage, expected, desired)).toEqual({
      method: 'POST',
      body: JSON.stringify({
        action: 'adjust_stage_draw',
        sessionId: 'session-1',
        stage: championshipStage,
        expectedMatches: expected,
        matches: desired,
      }),
    });
  });

  it('rejects self-matches and duplicate teams while accepting the exact cohort once', () => {
    expect(validateStageDraft(championshipStage, expected, [
      { ...expected[0], teamBId: 'team-1' },
      expected[1],
    ])).toMatch(/cannot play itself/i);

    expect(validateStageDraft(championshipStage, expected, [
      expected[0],
      { ...expected[1], teamAId: 'team-1' },
    ])).toMatch(/exactly once/i);

    expect(validateStageDraft(championshipStage, expected, [
      { ...expected[0], teamBId: 'team-4' },
      { ...expected[1], teamAId: 'team-2', teamBId: 'team-3' },
    ])).toBeNull();
  });
});

describe('round-robin draft helpers', () => {
  const draft: StageSnapshot[] = [
    { matchId: 'match-1', teamAId: 'team-1', teamBId: 'team-2', sequence: 3 },
    { matchId: 'match-2', teamAId: 'team-3', teamBId: 'team-4', sequence: 7 },
  ];

  it('moves a match by swapping only sequence values', () => {
    expect(moveRoundRobinMatch(draft, 'match-2', 'up')).toEqual([
      { ...draft[0], sequence: 7 },
      { ...draft[1], sequence: 3 },
    ]);
    expect(draft[0].sequence).toBe(3);
  });

  it('swaps only team A and B for the selected match', () => {
    expect(swapRoundRobinSides(draft, 'match-1')).toEqual([
      { ...draft[0], teamAId: 'team-2', teamBId: 'team-1' },
      draft[1],
    ]);
  });
});

describe('StageDrawEditor', () => {
  const stageMatches = [
    match({ id: 'match-1', sequence: 8, matchKind: 'championship', bracketRound: 1 }),
    match({ id: 'match-2', sequence: 9, teamAId: 'team-3', teamBId: 'team-4', matchKind: 'championship', bracketRound: 1 }),
  ];

  beforeEach(() => {
    mockedAdminRequest.mockReset();
  });

  afterEach(cleanup);

  function renderEditor(onSaved = vi.fn()) {
    render(
      <StageDrawEditor
        sessionId="session-1"
        stage={championshipStage}
        matches={stageMatches}
        teams={teams}
        label="Quarterfinal"
        onSaved={onSaved}
      />,
    );
    return onSaved;
  }

  it('moves focus into the editor and Cancel restores the stage-labelled trigger', async () => {
    renderEditor();

    const trigger = screen.getByRole('button', { name: 'Adjust Quarterfinal draw' });
    expect(trigger.className).toContain('min-h-11');
    fireEvent.click(trigger);
    expect(screen.getByRole('region', { name: 'Adjust Quarterfinal draw' })).toBeTruthy();
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.className).toContain('min-h-11');
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    fireEvent.click(cancel);
    expect(screen.queryByRole('region', { name: 'Adjust Quarterfinal draw' })).toBeNull();
    const restoredTrigger = screen.getByRole('button', { name: 'Adjust Quarterfinal draw' });
    await waitFor(() => expect(document.activeElement).toBe(restoredTrigger));
  });

  it('disables Save and shows an error for a duplicate-team draft', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Quarterfinal draw' }));

    fireEvent.change(screen.getByLabelText('Match 9 team A'), { target: { value: 'team-1' } });

    const saveButton = screen.getByRole('button', { name: 'Save draw' }) as HTMLButtonElement;
    const validationAlert = screen.getByRole('alert');
    expect(saveButton.disabled).toBe(true);
    expect(validationAlert.textContent).toMatch(/exactly once/i);
    expect(saveButton.getAttribute('aria-describedby')).toBe(validationAlert.id);
  });

  it('shows an API failure as an alert and stays open', async () => {
    mockedAdminRequest.mockRejectedValueOnce(new Error('The session changed.'));
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Quarterfinal draw' }));

    fireEvent.change(screen.getByLabelText('Match 8 team B'), { target: { value: 'team-4' } });
    fireEvent.change(screen.getByLabelText('Match 9 team B'), { target: { value: 'team-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draw' }));

    expect((await screen.findByRole('alert')).textContent).toBe('The session changed.');
    expect(screen.getByRole('region', { name: 'Adjust Quarterfinal draw' })).toBeTruthy();
  });

  it('submits the captured snapshot, calls onSaved, and closes after success', async () => {
    mockedAdminRequest.mockResolvedValueOnce({});
    const onSaved = renderEditor(vi.fn().mockResolvedValue(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Quarterfinal draw' }));

    fireEvent.change(screen.getByLabelText('Match 8 team B'), { target: { value: 'team-4' } });
    fireEvent.change(screen.getByLabelText('Match 9 team B'), { target: { value: 'team-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draw' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mockedAdminRequest).toHaveBeenCalledWith('/api/admin/sessions', expect.objectContaining({ method: 'POST' }));
    expect(screen.queryByRole('region', { name: 'Adjust Quarterfinal draw' })).toBeNull();
    const restoredTrigger = screen.getByRole('button', { name: 'Adjust Quarterfinal draw' });
    await waitFor(() => expect(document.activeElement).toBe(restoredTrigger));
  });
});
