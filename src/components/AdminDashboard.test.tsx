// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useSWR from 'swr';
import { adminRequest } from '../lib/api';
import { ActivityProvider } from '../lib/activity';
import GlobalFeedback from './GlobalFeedback';
import {
  buildSeasonPointRulesFromForm,
  buildDeleteRosterPlayerRequest,
  buildArchiveSeasonRequest,
  buildBulkPointAdjustmentPayload,
  buildReturnToQuarterFinalConfigRequest,
  buildScoreRequest,
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
  formatPlayerPoints,
  matchScoreFormKey,
  isValidQuarterFinalTeamSelection,
  isValidQualifyingMatchSetup,
  isValidKnockoutSetup,
  shouldRemoveRosterPlayer,
  shouldArchiveSeason,
  shouldReturnToQuarterFinalConfig,
  shouldShowQuarterFinalConfigReturn,
  splitQualifyingKnockoutMatches,
  sortPlayersByPoints,
  seasonPointRuleFields,
} from './AdminDashboard';
import AdminDashboard from './AdminDashboard';

vi.mock('swr', () => ({ default: vi.fn() }));
vi.mock('../lib/api', () => ({ adminRequest: vi.fn(), ApiError: class ApiError extends Error {} }));

const mockedUseSWR = vi.mocked(useSWR);
const mockedAdminRequest = vi.mocked(adminRequest);
const maxPointValue = 99_999_999_999.9;
const expectedRuleInputs = [
  { name: 'winPoints', label: 'Set win points', defaultValue: 1, min: 0 },
  { name: 'lossPoints', label: 'Set loss points', defaultValue: 0, min: 0 },
  { name: 'firstPlaceBonus', label: '1st place bonus', defaultValue: 4, min: 0 },
  { name: 'secondPlaceBonus', label: '2nd place bonus', defaultValue: 2, min: 0 },
  { name: 'thirdPlaceBonus', label: '3rd place bonus', defaultValue: 1, min: 0 },
  { name: 'maxSessionPoints', label: 'Maximum session points', defaultValue: 8, min: 0.1 },
] as const;

let seasons: Array<Record<string, unknown>> = [];

function renderDashboard({
  players = [],
  session = null,
}: {
  players?: Array<Record<string, unknown>>;
  session?: Record<string, unknown> | null;
} = {}) {
  const mutate = vi.fn().mockResolvedValue(undefined);
  const playerData = { players };
  const sessionData = { session };
  const memberData = { memberships: [] };
  const inactiveData = { players: [], session: null };
  mockedUseSWR.mockImplementation(((key: string | null) => {
    if (key === '/api/admin/seasons') return { data: { seasons }, mutate };
    if (key === '/api/admin/players') return { data: playerData, mutate };
    if (key === '/api/admin/sessions') return { data: sessionData, mutate };
    if (key === '/api/admin/members') return { data: memberData, mutate };
    if (key === null) return { data: inactiveData, mutate };
    return { data: undefined, mutate };
  }) as never);

  return render(
    <ActivityProvider>
      <GlobalFeedback />
      <AdminDashboard
        membership={{ id: 'admin-1', email: 'admin@example.com', role: 'superadmin', status: 'active' }}
        onDataChanged={vi.fn()}
      />
    </ActivityProvider>,
  );
}

function expectScoringRuleInputs(values: readonly number[]) {
  const group = screen.getByRole('group', { name: 'Scoring rules' });
  expect(within(group).getAllByRole('spinbutton')).toHaveLength(6);
  expectedRuleInputs.forEach((field, index) => {
    const input = within(group).getByRole('spinbutton', { name: field.label });
    expect(input).toHaveValue(values[index]);
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '0.1');
    expect(input).toHaveAttribute('min', String(field.min));
    expect(input).toHaveAttribute('max', String(maxPointValue));
    expect(input).toBeRequired();
  });
}

function requestBody(callIndex = 0) {
  const [, init] = mockedAdminRequest.mock.calls[callIndex];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => {
  cleanup();
  mockedAdminRequest.mockReset();
  mockedUseSWR.mockReset();
  seasons = [];
});

describe('season point rules', () => {
  it('defines the six scoring inputs with their required defaults and constraints', () => {
    expect(seasonPointRuleFields).toEqual(
      expectedRuleInputs.map((field) => ({ ...field, max: maxPointValue })),
    );
  });

  it('converts all six form values to numbers for season payloads', () => {
    const values = new FormData();
    values.set('winPoints', '1.5');
    values.set('lossPoints', '0.5');
    values.set('firstPlaceBonus', '4.5');
    values.set('secondPlaceBonus', '2.5');
    values.set('thirdPlaceBonus', '1.25');
    values.set('maxSessionPoints', '9.5');

    expect(buildSeasonPointRulesFromForm(values)).toEqual({
      winPoints: 1.5,
      lossPoints: 0.5,
      firstPlaceBonus: 4.5,
      secondPlaceBonus: 2.5,
      thirdPlaceBonus: 1.25,
      maxSessionPoints: 9.5,
    });
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['not a number', 'invalid'],
    ['infinite', 'Infinity'],
  ])('rejects a %s scoring value', (_case, invalidValue) => {
    const values = new FormData();
    expectedRuleInputs.forEach((field) => values.set(field.name, String(field.defaultValue)));
    if (invalidValue === null) values.delete('thirdPlaceBonus');
    else values.set('thirdPlaceBonus', invalidValue);

    expect(buildSeasonPointRulesFromForm(values)).toBeNull();
  });
});

describe('season point rule forms', () => {
  it('renders and submits all six configured defaults from the create form', async () => {
    mockedAdminRequest.mockResolvedValue({});
    renderDashboard();

    expectScoringRuleInputs(expectedRuleInputs.map((field) => field.defaultValue));
    fireEvent.change(screen.getByLabelText('Season name'), { target: { value: 'Spring 2027' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2027-09-01' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '18:30' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create season' }).closest('form')!);

    await waitFor(() => expect(mockedAdminRequest).toHaveBeenCalledTimes(1));
    expect(mockedAdminRequest).toHaveBeenCalledWith('/api/admin/seasons', expect.objectContaining({ method: 'POST' }));
    expect(requestBody()).toMatchObject({
      name: 'Spring 2027',
      winPoints: 1,
      lossPoints: 0,
      firstPlaceBonus: 4,
      secondPlaceBonus: 2,
      thirdPlaceBonus: 1,
      maxSessionPoints: 8,
    });
  });

  it('renders and submits all six current values from the active-season edit form', async () => {
    seasons = [{
      id: 'season-1',
      name: 'Winter 2027',
      status: 'active',
      winPoints: 1.5,
      lossPoints: 0.5,
      firstPlaceBonus: 4.5,
      secondPlaceBonus: 2.5,
      thirdPlaceBonus: 1.5,
      maxSessionPoints: 9.5,
    }];
    mockedAdminRequest.mockResolvedValue({});
    renderDashboard();

    expectScoringRuleInputs([1.5, 0.5, 4.5, 2.5, 1.5, 9.5]);
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);

    await waitFor(() => expect(mockedAdminRequest).toHaveBeenCalledTimes(1));
    expect(mockedAdminRequest).toHaveBeenCalledWith('/api/admin/seasons', expect.objectContaining({ method: 'PATCH' }));
    expect(requestBody()).toEqual({
      seasonId: 'season-1',
      winPoints: 1.5,
      lossPoints: 0.5,
      firstPlaceBonus: 4.5,
      secondPlaceBonus: 2.5,
      thirdPlaceBonus: 1.5,
      maxSessionPoints: 9.5,
    });
  });

  it('shows feedback and does not request when a submitted scoring value is empty', async () => {
    mockedAdminRequest.mockResolvedValue({});
    renderDashboard();
    fireEvent.change(screen.getByRole('spinbutton', { name: '3rd place bonus' }), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create season' }).closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid value for every scoring rule.');
    expect(mockedAdminRequest).not.toHaveBeenCalled();
  });
});

describe('player sex controls', () => {
  const player = {
    id: 'player-1',
    name: 'Alice',
    sex: 'Unknown',
    displayRating: 'NTRP 4.0',
    clubSkill: 5,
    points: 10,
    active: true,
  };

  it('submits the selected sex when adding a player', async () => {
    seasons = [{ id: 'season-1', name: 'Winter', status: 'active' }];
    mockedAdminRequest.mockResolvedValue({});
    renderDashboard();

    fireEvent.change(screen.getByPlaceholderText('Player name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Display rating, e.g. NTRP 4.0'), { target: { value: 'NTRP 4.0' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sex' }), { target: { value: 'F' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Add player' }).closest('form')!);

    await waitFor(() => expect(mockedAdminRequest).toHaveBeenCalledTimes(1));
    expect(mockedAdminRequest).toHaveBeenCalledWith('/api/admin/players', expect.objectContaining({ method: 'POST' }));
    expect(requestBody()).toMatchObject({ name: 'Alice', sex: 'F' });
  });

  it('updates sex from the active roster row', async () => {
    seasons = [{ id: 'season-1', name: 'Winter', status: 'active' }];
    mockedAdminRequest.mockResolvedValue({});
    renderDashboard({ players: [player] });

    fireEvent.change(screen.getByRole('combobox', { name: 'Alice sex' }), { target: { value: 'M' } });

    await waitFor(() => expect(mockedAdminRequest).toHaveBeenCalledTimes(1));
    expect(mockedAdminRequest).toHaveBeenCalledWith('/api/admin/players', {
      method: 'PATCH',
      body: JSON.stringify({ playerId: 'player-1', sex: 'M' }),
    });
  });

  it('displays sex beside a player in the attendance list', () => {
    seasons = [{ id: 'season-1', name: 'Winter', status: 'active' }];
    renderDashboard({
      players: [{ ...player, sex: 'F' }],
      session: {
        id: 'session-1',
        name: 'Wednesday Doubles',
        scheduledAt: '2026-07-29T09:00:00.000Z',
        format: 'round_robin',
        status: 'draft',
        participants: [{ playerId: 'player-1', name: 'Alice', status: 'attendee', group: 'A' }],
        teams: [],
        matches: [],
      },
    });

    expect(screen.getByText('· F')).toBeInTheDocument();
  });
});

describe('formatPlayerPoints', () => {
  it.each([
    [120, '120 pts'],
    [150.5, '150.5 pts'],
    [0, '0 pts'],
    [-1, '-1 pts'],
  ])('formats %s without rounding as %s', (points, expected) => {
    expect(formatPlayerPoints(points)).toBe(expected);
  });
});

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
      { id: 'low', name: 'Zoe', sex: 'Unknown' as const, displayRating: 'B2', clubSkill: 4, points: 10, active: true },
      { id: 'tie-z', name: 'Zara', sex: 'Unknown' as const, displayRating: 'A2', clubSkill: 7, points: 20, active: true },
      { id: 'highest', name: 'Aaron', sex: 'Unknown' as const, displayRating: 'A1', clubSkill: 8, points: 30, active: false },
      { id: 'tie-a', name: 'Amy', sex: 'Unknown' as const, displayRating: 'A2', clubSkill: 7, points: 20, active: true },
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

  it('sorts by points ascending and name ascending without mutating the source', () => {
    const players = [
      { id: 'highest', name: 'Aaron', sex: 'Unknown' as const, displayRating: 'A1', clubSkill: 8, points: 30, active: true },
      { id: 'tie-z', name: 'Zara', sex: 'Unknown' as const, displayRating: 'A2', clubSkill: 7, points: 20, active: true },
      { id: 'lowest', name: 'Zoe', sex: 'Unknown' as const, displayRating: 'B2', clubSkill: 4, points: 10, active: true },
      { id: 'tie-a', name: 'Amy', sex: 'Unknown' as const, displayRating: 'A2', clubSkill: 7, points: 20, active: true },
    ];
    const originalOrder = players.map((player) => player.id);

    expect(sortPlayersByPoints(players, 'ascending').map((player) => player.id)).toEqual([
      'lowest',
      'tie-a',
      'tie-z',
      'highest',
    ]);
    expect(players.map((player) => player.id)).toEqual(originalOrder);
  });
});

describe('manual pairing', () => {
  it('creates numbered rows from equally sized A and B groups', () => {
    expect(createManualPairRows(
      [{ id: 'a1', sex: 'M' }, { id: 'a2', sex: 'F' }],
      [{ id: 'b1', sex: 'F' }, { id: 'b2', sex: 'M' }],
    )).toEqual([
      { number: '1', groupAPlayerId: 'a1', groupBPlayerId: 'b1' },
      { number: '2', groupAPlayerId: 'a2', groupBPlayerId: 'b2' },
    ]);
  });

  it('creates cross-ranked defaults from descending A and ascending B players', () => {
    const groupA = sortPlayersByPoints([
      { id: 'a-low', name: 'A Low', sex: 'M' as const, displayRating: 'A2', clubSkill: 6, points: 20, active: true },
      { id: 'a-high', name: 'A High', sex: 'M' as const, displayRating: 'A1', clubSkill: 8, points: 80, active: true },
    ]);
    const groupB = sortPlayersByPoints([
      { id: 'b-high', name: 'B High', sex: 'M' as const, displayRating: 'B1', clubSkill: 5, points: 60, active: true },
      { id: 'b-low', name: 'B Low', sex: 'M' as const, displayRating: 'B2', clubSkill: 3, points: 10, active: true },
    ], 'ascending');

    expect(createManualPairRows(groupA, groupB)).toEqual([
      { number: '1', groupAPlayerId: 'a-high', groupBPlayerId: 'b-low' },
      { number: '2', groupAPlayerId: 'a-low', groupBPlayerId: 'b-high' },
    ]);
  });

  it('reorders default partners to avoid female-female pairs', () => {
    expect(createManualPairRows(
      [{ id: 'a-m', sex: 'M' }, { id: 'a-f', sex: 'F' }],
      [{ id: 'b-m', sex: 'M' }, { id: 'b-f', sex: 'F' }],
    )).toEqual([
      { number: '1', groupAPlayerId: 'a-m', groupBPlayerId: 'b-f' },
      { number: '2', groupAPlayerId: 'a-f', groupBPlayerId: 'b-m' },
    ]);
  });

  it('uses Unknown as a neutral partner for a female player', () => {
    expect(createManualPairRows(
      [{ id: 'a-f', sex: 'F' }, { id: 'a-m', sex: 'M' }],
      [{ id: 'b-f', sex: 'F' }, { id: 'b-u', sex: 'Unknown' }],
    )[0]).toEqual({
      number: '1',
      groupAPlayerId: 'a-f',
      groupBPlayerId: 'b-u',
    });
  });

  it('keeps only unavoidable female-female pairs', () => {
    const rows = createManualPairRows(
      [{ id: 'a-f1', sex: 'F' }, { id: 'a-f2', sex: 'F' }, { id: 'a-m', sex: 'M' }],
      [{ id: 'b-f1', sex: 'F' }, { id: 'b-f2', sex: 'F' }, { id: 'b-m', sex: 'M' }],
    );

    expect(rows).toEqual([
      { number: '1', groupAPlayerId: 'a-f1', groupBPlayerId: 'b-m' },
      { number: '2', groupAPlayerId: 'a-f2', groupBPlayerId: 'b-f1' },
      { number: '3', groupAPlayerId: 'a-m', groupBPlayerId: 'b-f2' },
    ]);
  });

  it('is deterministic for all-female and no-female groups', () => {
    expect(createManualPairRows(
      [{ id: 'a-f1', sex: 'F' }, { id: 'a-f2', sex: 'F' }],
      [{ id: 'b-f1', sex: 'F' }, { id: 'b-f2', sex: 'F' }],
    ).map((row) => row.groupBPlayerId)).toEqual(['b-f1', 'b-f2']);
    expect(createManualPairRows(
      [{ id: 'a-m', sex: 'M' }, { id: 'a-u', sex: 'Unknown' }],
      [{ id: 'b-u', sex: 'Unknown' }, { id: 'b-m', sex: 'M' }],
    ).map((row) => row.groupBPlayerId)).toEqual(['b-u', 'b-m']);
  });

  it('does not create rows for unequal groups', () => {
    expect(createManualPairRows(
      [{ id: 'a1', sex: 'M' }, { id: 'a2', sex: 'F' }],
      [{ id: 'b1', sex: 'Unknown' }],
    )).toEqual([]);
  });

  it('builds a payload only when every player and pair number is unique', () => {
    const rows = createManualPairRows(
      [{ id: 'a1', sex: 'M' }, { id: 'a2', sex: 'M' }],
      [{ id: 'b1', sex: 'M' }, { id: 'b2', sex: 'M' }],
    );
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

describe('score request', () => {
  it('changes form identity only when the displayed pairing changes', () => {
    const displayedMatch = {
      id: 'match-1',
      teamAId: 'team-a',
      teamBId: 'team-b',
      scoreA: null,
      scoreB: null,
      court: null,
    };

    expect(matchScoreFormKey({ ...displayedMatch, scoreA: 11, scoreB: 8, court: 'Court 2' }))
      .toBe(matchScoreFormKey(displayedMatch));
    expect(matchScoreFormKey({ ...displayedMatch, teamAId: 'team-c' }))
      .not.toBe(matchScoreFormKey(displayedMatch));
    expect(matchScoreFormKey({ ...displayedMatch, teamBId: 'team-d' }))
      .not.toBe(matchScoreFormKey(displayedMatch));
  });

  it('locks the displayed teams into the score request', () => {
    expect(buildScoreRequest('match-1', 'team-a', 'team-b', 11, 8, 'Court 2')).toEqual({
      method: 'POST',
      body: JSON.stringify({
        action: 'score',
        matchId: 'match-1',
        expectedTeamAId: 'team-a',
        expectedTeamBId: 'team-b',
        scoreA: 11,
        scoreB: 8,
        court: 'Court 2',
      }),
    });
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
