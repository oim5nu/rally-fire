import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { adminRequest, ApiError } from '../lib/api';
import DateTimePicker from './DateTimePicker';
import { useActivity } from '../lib/activity';
import KnockoutBracket from './KnockoutBracket';
import { StageDrawEditor, type StageKey } from './StageDrawEditor';

interface Membership {
  id: string;
  email: string;
  role: 'admin' | 'superadmin';
  status: 'active' | 'disabled';
}

export type PlayerSex = 'M' | 'F' | 'Unknown';

interface AdminPlayer {
  id: string;
  name: string;
  sex: PlayerSex;
  displayRating: string;
  clubSkill: number;
  points: number;
  active: boolean;
}

interface AdminMatch {
  id: string;
  sequence: number;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  court: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  bracketRound: number | null;
  bracketPosition: number | null;
  matchKind?: 'round_robin' | 'qualifier' | 'championship' | 'placement';
  placementGroup?: number | null;
  placementBestRank?: number | null;
  placementWorstRank?: number | null;
  loserNextMatchId?: string | null;
  loserToSlot?: 'A' | 'B' | null;
}

interface AdminSession {
  id: string;
  name: string;
  scheduledAt: string;
  format: 'round_robin' | 'knockout' | 'qualifying_knockout';
  status: 'draft' | 'draw_published' | 'in_progress' | 'finalized' | 'voided';
  participants: Array<{
    playerId: string;
    name: string;
    status: 'attendee' | 'reserve';
    group: 'A' | 'B' | null;
  }>;
  teams: Array<{
    id: string;
    seed: number;
    members: Array<{ playerId: string; name: string; group: 'A' | 'B' }>;
  }>;
  matches: AdminMatch[];
}

interface AdminDashboardProps {
  membership: Membership;
  onDataChanged: () => void;
}

export interface ManualPairRow {
  number: string;
  groupAPlayerId: string;
  groupBPlayerId: string;
}

interface SeasonPointRules {
  winPoints: number;
  lossPoints: number;
  firstPlaceBonus: number;
  secondPlaceBonus: number;
  thirdPlaceBonus: number;
  maxSessionPoints: number;
}

const maxSeasonPointValue = 99_999_999_999.9;

export const seasonPointRuleFields = [
  { name: 'winPoints', label: 'Set win points', defaultValue: 1, min: 0, max: maxSeasonPointValue },
  { name: 'lossPoints', label: 'Set loss points', defaultValue: 0, min: 0, max: maxSeasonPointValue },
  { name: 'firstPlaceBonus', label: '1st place bonus', defaultValue: 4, min: 0, max: maxSeasonPointValue },
  { name: 'secondPlaceBonus', label: '2nd place bonus', defaultValue: 2, min: 0, max: maxSeasonPointValue },
  { name: 'thirdPlaceBonus', label: '3rd place bonus', defaultValue: 1, min: 0, max: maxSeasonPointValue },
  { name: 'maxSessionPoints', label: 'Maximum session points', defaultValue: 8, min: 0.1, max: maxSeasonPointValue },
] as const;

export function buildSeasonPointRulesFromForm(form: Pick<FormData, 'get'>): SeasonPointRules | null {
  function numberValue(name: (typeof seasonPointRuleFields)[number]['name']): number | null {
    const value = form.get(name);
    if (typeof value !== 'string' || value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  const winPoints = numberValue('winPoints');
  const lossPoints = numberValue('lossPoints');
  const firstPlaceBonus = numberValue('firstPlaceBonus');
  const secondPlaceBonus = numberValue('secondPlaceBonus');
  const thirdPlaceBonus = numberValue('thirdPlaceBonus');
  const maxSessionPoints = numberValue('maxSessionPoints');
  if (winPoints === null
    || lossPoints === null
    || firstPlaceBonus === null
    || secondPlaceBonus === null
    || thirdPlaceBonus === null
    || maxSessionPoints === null) return null;

  return { winPoints, lossPoints, firstPlaceBonus, secondPlaceBonus, thirdPlaceBonus, maxSessionPoints };
}

export type KnockoutSetupSource =
  | { kind: 'team'; teamIndex: number }
  | { kind: 'preliminary'; matchIndex: number };

export interface KnockoutSetup {
  preliminaryPairs: Array<[number, number]>;
  mainSources: KnockoutSetupSource[];
}

const adminFetcher = <T,>(url: string) => adminRequest<T>(url);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The action could not be completed.';
}

const rosterRemovalConfirmation = 'Remove this player from the active season roster? History will be kept.';
const seasonArchiveConfirmation = 'Finalize and archive this season? Active draft or live sessions must be finished first.';
const quarterFinalConfigReturnConfirmation = 'Return to quarter-final configuration? Current knockout/playoff matches and scores will be deleted.';

export function shouldRemoveRosterPlayer(confirmRemoval: (message: string) => boolean = window.confirm): boolean {
  return confirmRemoval(rosterRemovalConfirmation);
}

export function shouldArchiveSeason(confirmArchive: (message: string) => boolean = window.confirm): boolean {
  return confirmArchive(seasonArchiveConfirmation);
}

export function shouldReturnToQuarterFinalConfig(confirmReturn: (message: string) => boolean = window.confirm): boolean {
  return confirmReturn(quarterFinalConfigReturnConfirmation);
}

export function buildDeleteRosterPlayerRequest(playerId: string): RequestInit {
  return {
    method: 'DELETE',
    body: JSON.stringify({ playerId }),
  };
}

export function buildArchiveSeasonRequest(seasonId: string, endsAt: string): RequestInit {
  return {
    method: 'PATCH',
    body: JSON.stringify({
      seasonId,
      status: 'archived',
      endsAt,
    }),
  };
}

export function buildBulkPointAdjustmentPayload(
  rows: Array<{ playerId: string; points: string }>,
  notes: string,
  idempotencyKey: string,
) {
  const normalizedNotes = notes.trim();
  if (!normalizedNotes) return null;

  const adjustments = rows
    .filter((row) => row.points.trim() !== '')
    .map((row) => ({ playerId: row.playerId, points: Number(row.points) }))
    .filter((row) => Number.isFinite(row.points) && row.points !== 0);

  if (adjustments.length === 0) return null;

  return {
    adjustments,
    notes: normalizedNotes,
    idempotencyKey,
  };
}

export function buildReturnToQuarterFinalConfigRequest(sessionId: string): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify({ action: 'return_to_quarter_final_config', sessionId }),
  };
}

export function buildScoreRequest(
  matchId: string,
  expectedTeamAId: string,
  expectedTeamBId: string,
  scoreA: number,
  scoreB: number,
  court: string | null,
): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify({
      action: 'score',
      matchId,
      expectedTeamAId,
      expectedTeamBId,
      scoreA,
      scoreB,
      court,
    }),
  };
}

export function matchScoreFormKey<T extends {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
}>(match: T): string {
  return JSON.stringify([match.id, match.teamAId, match.teamBId]);
}

function MatchScoreRow({
  match,
  session,
  onSaved,
  compact = false,
}: {
  match: AdminMatch;
  session: AdminSession;
  onSaved: () => Promise<void>;
  compact?: boolean;
}) {
  const { reportError, track } = useActivity();
  const [scoreA, setScoreA] = useState(match.scoreA?.toString() ?? '');
  const [scoreB, setScoreB] = useState(match.scoreB?.toString() ?? '');
  const [court, setCourt] = useState(match.court ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const teamA = session.teams.find((team) => team.id === match.teamAId);
  const teamB = session.teams.find((team) => team.id === match.teamBId);

  async function saveScore(event: React.FormEvent) {
    event.preventDefault();
    if (!match.teamAId || !match.teamBId) {
      const message = 'Both teams must be resolved before this match can be scored.';
      setError(message);
      reportError(message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await track(() => adminRequest('/api/admin/sessions', buildScoreRequest(
        match.id,
        match.teamAId!,
        match.teamBId!,
        Number(scoreA),
        Number(scoreB),
        court || null,
      )));
      await onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
      reportError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <form onSubmit={saveScore} className="w-72 rounded-xl border border-outline-variant/25 bg-surface-dim/90 p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant"><span>Match {match.sequence}</span><span>{match.status}</span></div>
        <label className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs font-bold text-white"><span className="truncate">{teamA && `#${teamA.seed} ${teamA.members.map((member) => member.name).join(' / ')}`}</span><input aria-label={`Match ${match.sequence} team A score`} type="number" min="0" max="99" required value={scoreA} onChange={(event) => setScoreA(event.target.value)} className="w-12 rounded border border-outline-variant bg-surface-container px-1 py-1 text-center text-white" /></label>
        <label className="mt-1 flex items-center justify-between gap-2 rounded px-2 py-1 text-xs font-bold text-white"><span className="truncate">{teamB && `#${teamB.seed} ${teamB.members.map((member) => member.name).join(' / ')}`}</span><input aria-label={`Match ${match.sequence} team B score`} type="number" min="0" max="99" required value={scoreB} onChange={(event) => setScoreB(event.target.value)} className="w-12 rounded border border-outline-variant bg-surface-container px-1 py-1 text-center text-white" /></label>
        <div className="mt-2 flex gap-2"><input aria-label={`Match ${match.sequence} court`} value={court} onChange={(event) => setCourt(event.target.value)} placeholder="Court" className="min-w-0 flex-1 rounded border border-outline-variant bg-surface-container px-2 py-1.5 text-xs text-white" /><button disabled={busy} className="rounded bg-primary-fixed px-3 py-1.5 text-xs font-black text-on-primary-fixed disabled:opacity-50">{match.status === 'completed' ? 'Update' : 'Save'}</button></div>
        {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={saveScore} className="grid gap-3 rounded-xl border border-outline-variant/20 bg-surface-dim/60 p-4 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-center">
      <p className="text-sm font-bold text-white">{teamA && `#${teamA.seed} ${teamA.members.map((member) => member.name).join(' / ')}`}</p>
      <div className="flex items-center gap-2">
        <input aria-label={`Match ${match.sequence} team A score`} type="number" min="0" max="99" required value={scoreA} onChange={(event) => setScoreA(event.target.value)} className="w-16 rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-center text-white" />
        <span className="text-on-surface-variant">:</span>
        <input aria-label={`Match ${match.sequence} team B score`} type="number" min="0" max="99" required value={scoreB} onChange={(event) => setScoreB(event.target.value)} className="w-16 rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-center text-white" />
      </div>
      <p className="text-sm font-bold text-white lg:text-right">{teamB && `#${teamB.seed} ${teamB.members.map((member) => member.name).join(' / ')}`}</p>
      <div className="flex gap-2">
        <input aria-label={`Match ${match.sequence} court`} value={court} onChange={(event) => setCourt(event.target.value)} placeholder="Court" className="w-20 rounded-lg border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white" />
        <button disabled={busy} className="rounded-lg bg-primary-fixed px-3 py-2 text-xs font-black text-on-primary-fixed disabled:opacity-50">{match.status === 'completed' ? 'Update' : 'Save'}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-300 lg:col-span-4">{error}</p>}
    </form>
  );
}

export function countAttendeeGroups(
  selectedPlayers: ReadonlySet<string>,
  groupOverrides: Readonly<Record<string, 'A' | 'B'>>,
) {
  let groupA = 0;
  let groupB = 0;

  selectedPlayers.forEach((playerId) => {
    if (groupOverrides[playerId] === 'A') groupA += 1;
    if (groupOverrides[playerId] === 'B') groupB += 1;
  });

  return {
    attendees: selectedPlayers.size,
    groupA,
    groupB,
    auto: selectedPlayers.size - groupA - groupB,
  };
}

export function formatPlayerPoints(points: number): string {
  return `${points} pts`;
}

export function sortPlayersByPoints(
  players: readonly AdminPlayer[],
  order: 'ascending' | 'descending' = 'descending',
): AdminPlayer[] {
  return [...players].sort((left, right) => {
    const pointsComparison = order === 'ascending'
      ? left.points - right.points
      : right.points - left.points;
    return pointsComparison || left.name.localeCompare(right.name);
  });
}

export function createManualPairRows(
  groupAPlayers: ReadonlyArray<{ id: string; sex: PlayerSex }>,
  groupBPlayers: ReadonlyArray<{ id: string; sex: PlayerSex }>,
): ManualPairRow[] {
  if (groupAPlayers.length !== groupBPlayers.length) return [];

  const remainingGroupB = [...groupBPlayers];
  const partners = new Array<(typeof groupBPlayers)[number] | undefined>(groupAPlayers.length);
  groupAPlayers.forEach((player, index) => {
    if (player.sex !== 'F') return;
    const preferredIndex = remainingGroupB.findIndex((candidate) => candidate.sex !== 'F');
    const selectedIndex = preferredIndex >= 0 ? preferredIndex : 0;
    partners[index] = remainingGroupB.splice(selectedIndex, 1)[0];
  });
  groupAPlayers.forEach((_player, index) => {
    partners[index] ??= remainingGroupB.shift();
  });

  return groupAPlayers.map((groupAPlayer, index) => ({
    number: String(index + 1),
    groupAPlayerId: groupAPlayer.id,
    groupBPlayerId: partners[index]!.id,
  }));
}

export function buildManualPairPayload(
  rows: ManualPairRow[],
  groupAIds: string[],
  groupBIds: string[],
) {
  if (rows.length < 2 || rows.length !== groupAIds.length || rows.length !== groupBIds.length) return null;
  const numbers = rows.map((row) => Number(row.number));
  const selectedA = rows.map((row) => row.groupAPlayerId);
  const selectedB = rows.map((row) => row.groupBPlayerId);
  const sameIds = (selected: string[], expected: string[]) =>
    selected.length === new Set(selected).size
    && [...selected].sort().join('\0') === [...expected].sort().join('\0');
  if (numbers.some((number) => !Number.isInteger(number) || number < 1)
    || new Set(numbers).size !== numbers.length
    || !sameIds(selectedA, groupAIds)
    || !sameIds(selectedB, groupBIds)) return null;
  return rows.map((row, index) => ({
    number: numbers[index],
    groupAPlayerId: row.groupAPlayerId,
    groupBPlayerId: row.groupBPlayerId,
  }));
}

function uiBracketSeedOrder(size: number): number[] {
  let order = [1, 2];
  for (let currentSize = 2; currentSize < size; currentSize *= 2) {
    const nextSize = currentSize * 2;
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return size === 1 ? [1] : order;
}

export function createDefaultKnockoutSetup(teamCount: number): KnockoutSetup {
  if (teamCount < 2) return { preliminaryPairs: [], mainSources: [] };
  const mainSize = 2 ** Math.floor(Math.log2(teamCount));
  const preliminaryCount = teamCount - mainSize;
  const byeCount = mainSize - preliminaryCount;
  const preliminaryPairs = Array.from({ length: preliminaryCount }, (_, index) => [
    byeCount + index,
    teamCount - 1 - index,
  ] as [number, number]);
  const nominalSources = Array.from({ length: mainSize }, (_, index): KnockoutSetupSource =>
    index < byeCount
      ? { kind: 'team', teamIndex: index }
      : { kind: 'preliminary', matchIndex: index - byeCount });
  return {
    preliminaryPairs,
    mainSources: uiBracketSeedOrder(mainSize).map((seed) => nominalSources[seed - 1]),
  };
}

export function createQualifyingKnockoutSetup(): KnockoutSetup {
  return {
    preliminaryPairs: [],
    mainSources: uiBracketSeedOrder(8).map((seed) => ({ kind: 'team', teamIndex: seed - 1 })),
  };
}

export function createDefaultQualifyingMatchSetup(teamCount: number): Array<[number, number]> {
  return Array.from({ length: Math.floor(teamCount / 2) }, (_, index) => [index * 2, index * 2 + 1]);
}

export function isValidQualifyingMatchSetup(teamCount: number, qualifyingPairs: Array<[number, number]>): boolean {
  if (teamCount !== 10 || qualifyingPairs.length !== 5) return false;
  const teamUses = qualifyingPairs.flat();
  return teamUses.every((teamIndex) => Number.isInteger(teamIndex) && teamIndex >= 0 && teamIndex < teamCount)
    && [...teamUses].sort((left, right) => left - right).join(',') === Array.from({ length: teamCount }, (_, index) => index).join(',');
}

export function isValidKnockoutSetup(teamCount: number, setup: KnockoutSetup): boolean {
  if (teamCount < 2) return false;
  const mainSize = 2 ** Math.floor(Math.log2(teamCount));
  const preliminaryCount = teamCount - mainSize;
  if (setup.preliminaryPairs.length !== preliminaryCount || setup.mainSources.length !== mainSize) return false;
  const teams = setup.preliminaryPairs.flat();
  const preliminaries: number[] = [];
  setup.mainSources.forEach((source) => source.kind === 'team' ? teams.push(source.teamIndex) : preliminaries.push(source.matchIndex));
  return [...teams].sort((a, b) => a - b).join(',') === Array.from({ length: teamCount }, (_, index) => index).join(',')
    && [...preliminaries].sort((a, b) => a - b).join(',') === Array.from({ length: preliminaryCount }, (_, index) => index).join(',');
}

export function createDefaultQuarterFinalTeamIds(standings: ReturnType<typeof buildQualifyingStandings>) {
  return standings.filter((standing) => standing.qualified).map((standing) => standing.team.id);
}

export function isValidQuarterFinalTeamSelection(
  standings: ReturnType<typeof buildQualifyingStandings>,
  selectedTeamIds: string[],
) {
  const allTeamIds = standings.map((standing) => standing.team.id);
  return standings.length === 10
    && selectedTeamIds.length === 8
    && new Set(selectedTeamIds).size === 8
    && selectedTeamIds.every((teamId) => allTeamIds.includes(teamId));
}

export function getAvailableQuarterFinalTeamIds(
  standings: ReturnType<typeof buildQualifyingStandings>,
) {
  return standings.map((standing) => standing.team.id);
}

export function getQuarterFinalPlayoffTeams(
  standings: ReturnType<typeof buildQualifyingStandings>,
  selectedTeamIds: string[],
) {
  return standings.filter((standing) => !selectedTeamIds.includes(standing.team.id));
}

export function buildQualifyingStandings(
  teams: AdminSession['teams'],
  matches: AdminSession['matches'],
) {
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const results = matches
    .filter((match) =>
      match.bracketRound === null
      && match.status === 'completed'
      && match.teamAId
      && match.teamBId
      && match.scoreA !== null
      && match.scoreB !== null)
    .flatMap((match) => [
      {
        team: teamMap.get(match.teamAId!)!,
        scoreFor: match.scoreA!,
        scoreAgainst: match.scoreB!,
      },
      {
        team: teamMap.get(match.teamBId!)!,
        scoreFor: match.scoreB!,
        scoreAgainst: match.scoreA!,
      },
    ])
    .filter((result) => result.team);

  if (results.length !== 10) return [];

  return results
    .map((result) => {
      const wins = result.scoreFor > result.scoreAgainst ? 1 : 0;
      return {
        ...result,
        seed: result.team.seed,
        wins,
        losses: wins ? 0 : 1,
        winPercentage: wins,
        pointDifferential: result.scoreFor - result.scoreAgainst,
        qualified: false,
      };
    })
    .sort((left, right) =>
      right.winPercentage - left.winPercentage
      || right.pointDifferential - left.pointDifferential
      || right.scoreFor - left.scoreFor
      || left.seed - right.seed,
    )
    .map((standing, index) => ({ ...standing, qualified: index < 8 }));
}

export function splitQualifyingKnockoutMatches(matches: AdminSession['matches']) {
  const legacyNonBracketMatches = matches.filter((match) => !match.matchKind && match.bracketRound === null);
  return {
    qualifierMatches: [
      ...matches.filter((match) => match.matchKind === 'qualifier'),
      ...legacyNonBracketMatches.slice(0, 5),
    ].sort((left, right) => left.sequence - right.sequence),
    consolationMatches: [
      ...matches.filter((match) => match.matchKind === 'placement' && match.placementBestRank === 9),
      ...legacyNonBracketMatches.slice(5),
    ].sort((left, right) => left.sequence - right.sequence),
    bracketMatches: matches.filter((match) => match.matchKind === 'championship' || (!match.matchKind && match.bracketRound !== null)),
  };
}

export function shouldShowQuarterFinalConfigReturn(format: AdminSession['format'], matches: AdminSession['matches']) {
  return format === 'qualifying_knockout' && matches.some((match) => match.bracketRound !== null);
}

export function getQualifyingConsolationTeams(standings: ReturnType<typeof buildQualifyingStandings>) {
  return standings.filter((standing) => !standing.qualified);
}

function formatName(format: AdminSession['format']) {
  if (format === 'knockout') return 'Knockout';
  if (format === 'qualifying_knockout') return 'Qualifying knockout';
  return 'Round robin';
}

export default function AdminDashboard({ membership, onDataChanged }: AdminDashboardProps) {
  const { reportError, track } = useActivity();
  const { data: seasonData, mutate: mutateSeasons } = useSWR<{
    seasons: Array<{
      id: string;
      name: string;
      status: string;
      winPoints: number;
      lossPoints: number;
      firstPlaceBonus: number;
      secondPlaceBonus: number;
      thirdPlaceBonus: number;
      maxSessionPoints: number;
    }>;
  }>('/api/admin/seasons', adminFetcher);
  const activeSeason = seasonData?.seasons.find((season) => season.status === 'active');
  const { data: playerData, error: playerError, mutate: mutatePlayers } = useSWR<{ players: AdminPlayer[] }>(activeSeason ? '/api/admin/players' : null, adminFetcher);
  const { data: sessionData, mutate: mutateSession } = useSWR<{ session: AdminSession | null }>(activeSeason ? '/api/admin/sessions' : null, adminFetcher);
  const { data: memberData, mutate: mutateMembers } = useSWR<{ memberships: Membership[] }>(membership.role === 'superadmin' ? '/api/admin/members' : null, adminFetcher);
  const players = playerData?.players ?? [];
  const session = sessionData?.session ?? null;
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [groupOverrides, setGroupOverrides] = useState<Record<string, 'A' | 'B'>>({});
  const [manualPairs, setManualPairs] = useState<ManualPairRow[]>([]);
  const [qualifyingMatchSetup, setQualifyingMatchSetup] = useState<Array<[number, number]>>([]);
  const [quarterFinalTeamIds, setQuarterFinalTeamIds] = useState<string[]>([]);
  const [knockoutSetup, setKnockoutSetup] = useState<KnockoutSetup>({ preliminaryPairs: [], mainSources: [] });
  const [attendanceDirty, setAttendanceDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const attendeeGroups = countAttendeeGroups(selectedPlayers, groupOverrides);
  const sortedPlayers = sortPlayersByPoints(players);

  useEffect(() => {
    if (!session || session.status !== 'draft') return;
    const attendees = session.participants.filter((participant) => participant.status === 'attendee');
    setSelectedPlayers(new Set(attendees.length ? attendees.map((participant) => participant.playerId) : players.filter((player) => player.active).map((player) => player.id)));
    setGroupOverrides(
      Object.fromEntries(
        attendees
          .filter((participant) => participant.group)
          .map((participant) => [participant.playerId, participant.group!]),
      ),
    );
    setAttendanceDirty(attendees.length === 0);
  }, [session, players]);

  const groupAPlayers = sortedPlayers.filter((player) => selectedPlayers.has(player.id) && groupOverrides[player.id] === 'A');
  const groupBPlayers = sortedPlayers.filter((player) => selectedPlayers.has(player.id) && groupOverrides[player.id] === 'B');
  const seededPairs = [...manualPairs].sort((left, right) => Number(left.number) - Number(right.number));
  const splitMatches = session?.format === 'qualifying_knockout'
    ? splitQualifyingKnockoutMatches(session.matches)
    : null;
  const qualifierMatches = splitMatches?.qualifierMatches ?? session?.matches.filter((match) => match.bracketRound === null) ?? [];
  const consolationMatches = splitMatches?.consolationMatches ?? [];
  const bracketMatches = splitMatches?.bracketMatches ?? session?.matches.filter((match) => match.bracketRound !== null) ?? [];
  const qualifyingStandings = session?.format === 'qualifying_knockout'
    ? buildQualifyingStandings(session.teams, qualifierMatches)
    : [];
  const qualifyingAdvancers = qualifyingStandings.filter((standing) => standing.qualified);
  const validQuarterFinalSelection = isValidQuarterFinalTeamSelection(qualifyingStandings, quarterFinalTeamIds);
  const qualifyingConsolationTeams = validQuarterFinalSelection
    ? getQuarterFinalPlayoffTeams(qualifyingStandings, quarterFinalTeamIds)
    : getQualifyingConsolationTeams(qualifyingStandings);
  const validQualifyingMatchSetup = session?.format !== 'qualifying_knockout'
    || isValidQualifyingMatchSetup(manualPairs.length, qualifyingMatchSetup);
  const qualifiersComplete = session?.format === 'qualifying_knockout'
    && qualifierMatches.length === 5
    && qualifierMatches.every((match) => match.status === 'completed')
    && qualifyingAdvancers.length === 8;
  const qualifyingBracketPending = session?.format === 'qualifying_knockout' && qualifiersComplete && bracketMatches.length === 0;
  const canReturnToQuarterFinalConfig = session
    ? shouldShowQuarterFinalConfigReturn(session.format, session.matches)
    : false;
  const onStageDrawSaved = async () => {
    await mutateSession();
    onDataChanged();
  };
  const renderBracketStageAction = (stageMatches: AdminMatch[], label: string) => {
    const firstMatch = stageMatches[0];
    if (!session || !firstMatch || (firstMatch.matchKind !== 'championship' && firstMatch.matchKind !== 'placement')) return null;
    const stage: StageKey = {
      matchKind: firstMatch.matchKind,
      bracketRound: firstMatch.bracketRound,
      placementGroup: firstMatch.placementGroup ?? null,
    };
    return (
      <StageDrawEditor
        sessionId={session.id}
        stage={stage}
        matches={stageMatches}
        teams={session.teams}
        label={label}
        onSaved={onStageDrawSaved}
      />
    );
  };

  useEffect(() => {
    setManualPairs(createManualPairRows(
      groupAPlayers,
      sortPlayersByPoints(groupBPlayers, 'ascending'),
    ));
  }, [selectedPlayers, groupOverrides, players]);

  useEffect(() => {
    setQualifyingMatchSetup(createDefaultQualifyingMatchSetup(manualPairs.length));
  }, [manualPairs.length]);

  useEffect(() => {
    if (session?.format === 'qualifying_knockout' && session.status !== 'draft') {
      setKnockoutSetup(createQualifyingKnockoutSetup());
      return;
    }
    setKnockoutSetup(createDefaultKnockoutSetup(manualPairs.length));
  }, [manualPairs.length, session?.format, session?.status]);

  useEffect(() => {
    if (session?.format !== 'qualifying_knockout' || qualifyingStandings.length !== 10) {
      setQuarterFinalTeamIds([]);
      return;
    }
    setQuarterFinalTeamIds((current) => (
      isValidQuarterFinalTeamSelection(qualifyingStandings, current)
        ? current
        : createDefaultQuarterFinalTeamIds(qualifyingStandings)
    ));
  }, [session?.format, qualifyingStandings.map((standing) => standing.team.id).join('|')]);

  useEffect(() => {
    if (playerError) reportError(errorMessage(playerError));
  }, [playerError, reportError]);

  const stage = useMemo(() => {
    if (!activeSeason) return 0;
    if (!session || session.status === 'finalized' || session.status === 'voided') return 1;
    if (session.status === 'draft') return 2;
    if (session.status === 'draw_published' || session.status === 'in_progress') return 3;
    return 4;
  }, [activeSeason, session]);

  async function refreshAll() {
    await Promise.all([mutateSeasons(), mutatePlayers(), mutateSession(), mutateMembers()]);
    onDataChanged();
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await track(async () => {
        await action();
        await refreshAll();
      });
      setNotice(success);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      reportError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createSeason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pointRules = buildSeasonPointRulesFromForm(form);
    if (!pointRules) {
      const message = 'Enter a valid value for every scoring rule.';
      setError(message);
      reportError(message);
      return;
    }
    await runAction(
      () => adminRequest('/api/admin/seasons', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          startsAt: new Date(String(form.get('startsAt'))).toISOString(),
          ...pointRules,
        }),
      }),
      'Season created. Add the first players next.',
    );
  }

  async function addPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const succeeded = await runAction(
      () => adminRequest('/api/admin/players', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          sex: form.get('sex'),
          displayRating: form.get('displayRating'),
          clubSkill: Number(form.get('clubSkill')),
          openingPoints: Number(form.get('openingPoints')),
        }),
      }),
      'Player added to the active season.',
    );
    if (succeeded) formElement.reset();
  }

  async function updatePlayerSex(playerId: string, sex: PlayerSex) {
    await runAction(
      () => adminRequest('/api/admin/players', {
        method: 'PATCH',
        body: JSON.stringify({ playerId, sex }),
      }),
      'Player sex updated.',
    );
  }

  async function deleteRosterPlayer(player: AdminPlayer) {
    if (!shouldRemoveRosterPlayer()) return;
    await runAction(
      () => adminRequest('/api/admin/players', buildDeleteRosterPlayerRequest(player.id)),
      `${player.name} removed from the active season roster.`,
    );
  }

  async function createSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runAction(
      () => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          name: form.get('name'),
          scheduledAt: new Date(String(form.get('scheduledAt'))).toISOString(),
          format: form.get('format'),
        }),
      }),
      'Session created. Confirm attendance before drawing teams.',
    );
  }

  async function bulkAdjustPoints(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = buildBulkPointAdjustmentPayload(
      sortedPlayers.map((player) => ({
        playerId: player.id,
        points: String(form.get(`points-${player.id}`) ?? ''),
      })),
      String(form.get('notes') ?? ''),
      crypto.randomUUID(),
    );
    if (!payload) {
      const message = 'Enter a reason and at least one non-zero adjustment.';
      setError(message);
      reportError(message);
      return;
    }

    const succeeded = await runAction(
      () =>
        adminRequest('/api/admin/points', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      'Bulk point adjustments added to the ledger.',
    );
    if (succeeded) formElement.reset();
  }

  async function saveParticipants() {
    if (!session) return;
    const attendeeIds = [...selectedPlayers];
    const succeeded = await runAction(
      () => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'participants',
          sessionId: session.id,
          attendeeIds,
          reserveIds: players.filter((player) => !selectedPlayers.has(player.id)).map((player) => player.id),
          groupOverrides,
        }),
      }),
      'Attendance and groups saved.',
    );
    if (succeeded) setAttendanceDirty(false);
  }

  async function generateSchedule() {
    if (!session) return;
    const pairs = buildManualPairPayload(
      manualPairs,
      groupAPlayers.map((player) => player.id),
      groupBPlayers.map((player) => player.id),
    );
    if (!pairs) {
      const message = 'Assign every attendee once, with unique positive pair numbers.';
      setError(message);
      reportError(message);
      return;
    }
    if (session.format === 'qualifying_knockout' && !isValidQualifyingMatchSetup(manualPairs.length, qualifyingMatchSetup)) {
      const message = 'Use every numbered pair exactly once across the five qualifying matches.';
      setError(message);
      reportError(message);
      return;
    }
    await runAction(
      () => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'draw',
          sessionId: session.id,
          pairs,
          knockoutConfig: session.format === 'knockout' ? knockoutSetup : undefined,
          qualifyingConfig: session.format === 'qualifying_knockout' ? { qualifyingPairs: qualifyingMatchSetup } : undefined,
        }),
      }),
      'Match schedule published.',
    );
  }

  async function startQualifyingKnockout() {
    if (!session) return;
    await runAction(
      () => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'start_knockout',
          sessionId: session.id,
          knockoutConfig: knockoutSetup,
          quarterFinalTeamIds,
        }),
      }),
      'Knockout bracket started with the top eight qualifiers.',
    );
  }

  async function returnToAttendance() {
    if (!session || !window.confirm(
      'Return to attendance? The current match schedule, courts, and all entered scores will be permanently discarded.',
    )) return;
    await runAction(
      () => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({ action: 'return_to_attendance', sessionId: session.id }),
      }),
      'Session returned to attendance. Configure groups and pairs again.',
    );
  }

  async function returnToQuarterFinalConfig() {
    if (!session || !shouldReturnToQuarterFinalConfig()) return;
    await runAction(
      () => adminRequest('/api/admin/sessions', buildReturnToQuarterFinalConfigRequest(session.id)),
      'Returned to quarter-final configuration. Current knockout/playoff matches were deleted.',
    );
  }

  async function changeSessionFormat(format: AdminSession['format']) {
    if (!session || format === session.format) return;
    await runAction(
      () => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_format', sessionId: session.id, format }),
      }),
      `Session format changed to ${format === 'knockout' ? 'knockout' : 'round robin'}.`,
    );
  }

  async function inviteAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const succeeded = await runAction(
      () => adminRequest('/api/admin/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), role: form.get('role') }),
      }),
      'Invitation sent.',
    );
    if (succeeded) formElement.reset();
  }

  async function updateMember(
    target: Membership,
    change: { role?: Membership['role']; status?: Membership['status']; revokeSessions?: boolean },
  ) {
    await runAction(
      () =>
        adminRequest('/api/admin/members', {
          method: 'PATCH',
          body: JSON.stringify({ membershipId: target.id, ...change }),
        }),
      change.revokeSessions ? 'Administrator sessions revoked.' : 'Administrator access updated.',
    );
  }

  async function updateSeason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSeason) return;
    const form = new FormData(event.currentTarget);
    const pointRules = buildSeasonPointRulesFromForm(form);
    if (!pointRules) {
      const message = 'Enter a valid value for every scoring rule.';
      setError(message);
      reportError(message);
      return;
    }
    await runAction(
      () =>
        adminRequest('/api/admin/seasons', {
          method: 'PATCH',
          body: JSON.stringify({
            seasonId: activeSeason.id,
            ...pointRules,
          }),
        }),
      'Default season awards updated. Existing sessions keep their snapshots.',
    );
  }

  async function archiveSeason() {
    if (!activeSeason || !shouldArchiveSeason()) return;
    await runAction(
      () => adminRequest('/api/admin/seasons', buildArchiveSeasonRequest(activeSeason.id, new Date().toISOString())),
      'Season finalized and archived.',
    );
  }

  async function downloadExport() {
    try {
      const payload = await track(() => adminRequest<Record<string, unknown>>('/api/admin/export'));
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rallyfire-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
      reportError(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-outline-variant/20 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-fixed">Club operations</p>
          <h1 className="mt-2 font-display text-3xl font-black text-white">Competition control</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{membership.email} · {membership.role}</p>
        </div>
        {membership.role === 'superadmin' && <button type="button" onClick={downloadExport} className="rounded-lg border border-outline-variant px-4 py-2 text-xs font-bold text-on-surface hover:border-primary-fixed hover:text-primary-fixed">Export all data</button>}
      </header>

      <ol className="grid grid-cols-4 overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container" aria-label="Session workflow">
        {['Season', 'Attendance', 'Draw & scores', 'Finalized'].map((label, index) => (
          <li key={label} className={`border-r border-outline-variant/15 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide last:border-r-0 ${stage >= index + 1 ? 'bg-primary-fixed/10 text-primary-fixed' : 'text-on-surface-variant'}`}>{label}</li>
        ))}
      </ol>

      {notice && <div role="status" className="rounded-xl border border-primary-fixed/30 bg-primary-fixed/10 p-4 text-sm text-white">{notice}</div>}

      {!activeSeason && membership.role === 'superadmin' && (
        <form onSubmit={createSeason} className="grid gap-4 rounded-2xl border border-primary-fixed/25 bg-surface-container p-6 md:grid-cols-2">
          <div className="md:col-span-2"><h2 className="text-xl font-black text-white">Create the first season</h2><p className="mt-1 text-sm text-on-surface-variant">The app starts empty. Set the schedule and scoring rules below.</p></div>
          <label className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
            Season name
            <input name="name" required placeholder="e.g. Winter League 2026" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 font-normal normal-case tracking-normal text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30" />
          </label>
          <DateTimePicker name="startsAt" label="Season starts" required />
          <fieldset className="rounded-xl border border-outline-variant/25 bg-surface-dim/40 p-4 md:col-span-2">
            <legend className="px-2 text-xs font-black uppercase tracking-widest text-primary-fixed">Scoring rules</legend>
            <p className="mb-3 text-xs text-on-surface-variant">Values are snapshotted into new sessions; each team member receives the full capped team total.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {seasonPointRuleFields.map((field) => (
                <label key={field.name} className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  {field.label}
                  <input name={field.name} type="number" min={field.min} max={field.max} step="0.1" defaultValue={field.defaultValue} required className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 font-normal normal-case tracking-normal text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30" />
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={busy} className="rounded-lg bg-primary-fixed px-5 py-3 text-sm font-black text-on-primary-fixed md:col-span-2 disabled:opacity-50">Create season</button>
        </form>
      )}

      {activeSeason && (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-5">
            <div><p className="text-xs font-bold uppercase tracking-widest text-primary-fixed">{activeSeason.name}</p><h2 className="mt-1 text-xl font-black text-white">Season roster</h2></div>
            {membership.role === 'superadmin' && (
              <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3">
                <form onSubmit={updateSeason}>
                  <fieldset>
                    <legend className="text-xs font-black uppercase tracking-widest text-primary-fixed">Scoring rules</legend>
                    <p className="mt-1 text-[11px] text-on-surface-variant">Values are snapshotted into new sessions; each team member receives the full capped team total.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {seasonPointRuleFields.map((field) => (
                        <label key={field.name} className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                          {field.label}
                          <input name={field.name} type="number" min={field.min} max={field.max} step="0.1" defaultValue={activeSeason[field.name]} required className="mt-1 w-full rounded border border-outline-variant bg-surface-container px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-white" />
                        </label>
                      ))}
                    </div>
                    <button disabled={busy} className="mt-3 w-full rounded bg-primary-fixed px-3 py-2 text-xs font-black text-on-primary-fixed disabled:opacity-50">Save</button>
                  </fieldset>
                </form>
                <button type="button" disabled={busy} onClick={() => void archiveSeason()} className="w-full rounded border border-red-300/70 px-3 py-2 text-xs font-black text-red-200 disabled:opacity-50">Finalize / Archive season</button>
              </div>
            )}
            <form onSubmit={addPlayer} className="grid gap-3 sm:grid-cols-2">
              <input name="name" required placeholder="Player name" className="rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" />
              <input name="displayRating" required placeholder="Display rating, e.g. NTRP 4.0" className="rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" />
              <label className="text-xs text-on-surface-variant">Sex<select name="sex" defaultValue="Unknown" required className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white"><option value="M">M</option><option value="F">F</option><option value="Unknown">Unknown</option></select></label>
              <label className="text-xs text-on-surface-variant">Club skill 1-10<input name="clubSkill" type="number" min="1" max="10" defaultValue="5" required className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-on-surface-variant">Opening points<input name="openingPoints" type="number" step="0.1" defaultValue="0" required className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" /></label>
              <button disabled={busy} className="rounded-lg border border-primary-fixed px-4 py-2 text-sm font-black text-primary-fixed sm:col-span-2 disabled:opacity-50">Add player</button>
            </form>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {sortedPlayers.map((player) => <div key={player.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-dim/60 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-bold text-white">{player.name}</span><select aria-label={`${player.name} sex`} value={player.sex} disabled={busy} onChange={(event) => void updatePlayerSex(player.id, event.target.value as PlayerSex)} className="shrink-0 rounded border border-outline-variant bg-surface-container px-1 py-1 text-xs text-white disabled:opacity-50"><option value="M">M</option><option value="F">F</option><option value="Unknown">Unknown</option></select><span className="shrink-0 text-xs text-on-surface-variant">Skill {player.clubSkill} · {player.points} pts</span><button type="button" disabled={busy} onClick={() => void deleteRosterPlayer(player)} aria-label={`Delete ${player.name}`} className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-red-300 underline disabled:opacity-50">Delete</button></div>)}
              {!players.length && <p className="py-5 text-center text-sm text-on-surface-variant">No players yet.</p>}
            </div>
            {players.length > 0 && (
              <form onSubmit={bulkAdjustPoints} className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3">
                <div>
                  <p className="text-xs font-black text-white">Bulk point adjustment</p>
                  <p className="mt-1 text-[11px] text-on-surface-variant">Enter positive or negative deltas. Blank and zero rows are skipped.</p>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {sortedPlayers.map((player) => (
                    <label key={player.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 rounded-lg bg-surface-container/70 px-3 py-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-white">{player.name}</span>
                        <span className="text-on-surface-variant">{player.points} pts current</span>
                      </span>
                      <input name={`points-${player.id}`} type="number" step="0.1" placeholder="+/- pts" className="rounded border border-outline-variant bg-surface-dim px-2 py-2 text-right text-white" />
                    </label>
                  ))}
                </div>
                <input name="notes" required placeholder="Shared reason for these adjustments" className="w-full rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white" />
                <button disabled={busy} className="w-full rounded border border-primary-fixed px-3 py-2 text-xs font-black text-primary-fixed disabled:opacity-50">Update point adjustments</button>
              </form>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-5">
            {!session || session.status === 'finalized' || session.status === 'voided' ? (
              <>
                {session && <div className="rounded-lg border border-outline-variant/20 bg-surface-dim p-3 text-sm text-on-surface-variant">Previous session: <strong className="text-white">{session.name}</strong> ({session.status})</div>}
                <form onSubmit={createSession} className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><h2 className="text-xl font-black text-white">Create play session</h2><p className="text-sm text-on-surface-variant">Only one session can be active at a time.</p></div>
                  <label className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                    Session name
                    <input name="name" required placeholder="Wednesday Doubles" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-3 font-normal normal-case tracking-normal text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30" />
                  </label>
                  <DateTimePicker name="scheduledAt" label="Scheduled date and time" required />
                  <label className="text-xs font-bold uppercase tracking-wide text-on-surface-variant sm:col-span-2">
                    Competition format
                    <select name="format" defaultValue="round_robin" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-3 font-normal normal-case tracking-normal text-white">
                      <option value="round_robin">Round robin</option>
                      <option value="knockout">Knockout bracket</option>
                      <option value="qualifying_knockout">Qualifying knockout</option>
                    </select>
                  </label>
                  <button disabled={busy} className="rounded-lg bg-primary-fixed px-4 py-2 text-sm font-black text-on-primary-fixed sm:col-span-2 disabled:opacity-50">Create session</button>
                </form>
                {session?.status === 'finalized' && membership.role === 'superadmin' && <button type="button" disabled={busy} onClick={() => runAction(() => adminRequest('/api/admin/sessions', { method: 'POST', body: JSON.stringify({ action: 'void', sessionId: session.id, reason: 'Voided by superadministrator from the control console', createReplacement: true }) }), 'Session voided and replacement draft created.')} className="text-xs font-bold text-red-300 underline">Void finalized session and create replacement</button>}
              </>
            ) : session.status === 'draft' ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-primary-fixed">Draft session</p><h2 className="mt-1 text-xl font-black text-white">{session.name}</h2><p className="text-sm text-on-surface-variant">Choose attendees, assign every player to A or B, save attendance, then configure each numbered pair.</p></div><label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Competition format<select aria-label="Draft session competition format" value={session.format} disabled={busy} onChange={(event) => void changeSessionFormat(event.target.value as AdminSession['format'])} className="mt-1 block rounded-lg border border-primary-fixed/40 bg-surface-dim px-3 py-2 text-xs font-bold normal-case text-white disabled:opacity-50"><option value="round_robin">Round robin</option><option value="knockout">Knockout bracket</option><option value="qualifying_knockout">Qualifying knockout</option></select></label></div>
                <p className="text-sm font-bold text-white" aria-live="polite">
                  {attendeeGroups.attendees} attendees · A: {attendeeGroups.groupA} · B: {attendeeGroups.groupB} · Auto: {attendeeGroups.auto}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sortedPlayers.filter((player) => player.active).map((player) => (
                    <div key={player.id} className="flex items-center gap-2 rounded-lg bg-surface-dim/60 p-2">
                      <input type="checkbox" checked={selectedPlayers.has(player.id)} onChange={(event) => { setAttendanceDirty(true); setSelectedPlayers((current) => { const next = new Set(current); event.target.checked ? next.add(player.id) : next.delete(player.id); return next; }); }} aria-label={`Include ${player.name}`} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                        {player.name}
                        <span className="font-normal text-on-surface-variant"> · {player.sex}</span>
                        {selectedPlayers.has(player.id) && <span className="font-normal text-on-surface-variant"> · {formatPlayerPoints(player.points)}</span>}
                      </span>
                      {selectedPlayers.has(player.id) && <select aria-label={`${player.name} group`} value={groupOverrides[player.id] ?? ''} onChange={(event) => { setAttendanceDirty(true); setGroupOverrides((current) => { const next = { ...current }; if (event.target.value) next[player.id] = event.target.value as 'A' | 'B'; else delete next[player.id]; return next; }); }} className="rounded border border-outline-variant bg-surface-container px-1 py-1 text-xs text-white"><option value="">Auto</option><option value="A">A</option><option value="B">B</option></select>}
                    </div>
                  ))}
                </div>
                <button type="button" disabled={busy} onClick={saveParticipants} className="rounded-lg border border-primary-fixed px-4 py-2 text-xs font-black text-primary-fixed disabled:opacity-50">Save attendance</button>
                {attendanceDirty ? (
                  <p className="text-xs text-amber-200">Save attendance and groups before configuring pairs.</p>
                ) : attendeeGroups.auto > 0 ? (
                  <p className="text-xs text-amber-200">Assign every attendee explicitly to A or B.</p>
                ) : groupAPlayers.length !== groupBPlayers.length || groupAPlayers.length < 2 ? (
                  <p className="text-xs text-amber-200">Groups A and B must be equal and contain at least two players each.</p>
                ) : (
                  <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3">
                    <div>
                      <h3 className="text-sm font-black text-white">Manual draw setup</h3>
                      <p className="mt-1 text-[11px] text-on-surface-variant">Configure every numbered pair before generating the draw.</p>
                    </div>
                    {manualPairs.map((pair, index) => (
                      <div key={index} className="grid grid-cols-[5rem_1fr_1fr] gap-2">
                        <input aria-label={`Pair ${index + 1} number`} type="number" min="1" step="1" value={pair.number} onChange={(event) => setManualPairs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, number: event.target.value } : row))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white" />
                        <select aria-label={`Pair ${index + 1} group A player`} value={pair.groupAPlayerId} onChange={(event) => setManualPairs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, groupAPlayerId: event.target.value } : row))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white">{groupAPlayers.map((player) => <option key={player.id} value={player.id}>A · {player.name} · {formatPlayerPoints(player.points)}</option>)}</select>
                        <select aria-label={`Pair ${index + 1} group B player`} value={pair.groupBPlayerId} onChange={(event) => setManualPairs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, groupBPlayerId: event.target.value } : row))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white">{groupBPlayers.map((player) => <option key={player.id} value={player.id}>B · {player.name} · {formatPlayerPoints(player.points)}</option>)}</select>
                      </div>
                    ))}
                    {session.format === 'knockout' && (
                      <div className="space-y-3 border-t border-outline-variant/20 pt-3">
                        <div><h4 className="text-xs font-black uppercase tracking-wider text-primary-fixed">Manual knockout path</h4><p className="mt-1 text-[11px] text-on-surface-variant">Choose each preliminary matchup, then place every direct pair or preliminary winner into the main bracket slots.</p></div>
                        {knockoutSetup.preliminaryPairs.map((preliminary, index) => (
                          <div key={`preliminary-${index}`} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-on-surface-variant">Prelim {index + 1}</span>
                            {([0, 1] as const).map((slot) => <select key={slot} aria-label={`Preliminary ${index + 1} slot ${slot === 0 ? 'A' : 'B'}`} value={preliminary[slot]} onChange={(event) => setKnockoutSetup((current) => ({ ...current, preliminaryPairs: current.preliminaryPairs.map((row, rowIndex) => rowIndex === index ? row.map((value, valueIndex) => valueIndex === slot ? Number(event.target.value) : value) as [number, number] : row) }))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white">{seededPairs.map((pair, pairIndex) => <option key={pairIndex} value={pairIndex}>Pair #{pair.number}</option>)}</select>)}
                          </div>
                        ))}
                        <div className="grid gap-2 sm:grid-cols-2">
                          {knockoutSetup.mainSources.map((source, index) => (
                            <label key={index} className="text-[10px] font-bold uppercase text-on-surface-variant">Main slot {index + 1}
                              <select aria-label={`Main bracket slot ${index + 1}`} value={source.kind === 'team' ? `team:${source.teamIndex}` : `preliminary:${source.matchIndex}`} onChange={(event) => { const [kind, rawIndex] = event.target.value.split(':'); setKnockoutSetup((current) => ({ ...current, mainSources: current.mainSources.map((entry, entryIndex) => entryIndex === index ? (kind === 'team' ? { kind: 'team', teamIndex: Number(rawIndex) } : { kind: 'preliminary', matchIndex: Number(rawIndex) }) : entry) })); }} className="mt-1 w-full rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs font-normal normal-case text-white">
                                {seededPairs.map((pair, pairIndex) => <option key={`team-${pairIndex}`} value={`team:${pairIndex}`}>Pair #{pair.number}</option>)}
                                {knockoutSetup.preliminaryPairs.map((_, preliminaryIndex) => <option key={`preliminary-${preliminaryIndex}`} value={`preliminary:${preliminaryIndex}`}>Winner of prelim {preliminaryIndex + 1}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                        {!isValidKnockoutSetup(manualPairs.length, knockoutSetup) && <p className="text-xs text-red-300">Use every pair and preliminary winner exactly once.</p>}
                      </div>
                    )}
                    {session.format === 'qualifying_knockout' && (
                      <div className="space-y-3 border-t border-outline-variant/20 pt-3">
                        <div><h4 className="text-xs font-black uppercase tracking-wider text-primary-fixed">Manual qualifying matches</h4><p className="mt-1 text-[11px] text-on-surface-variant">Choose the five qualifying matchups. After scores are complete, configure the quarter-final path; semi-finals are filled by quarter-final winners.</p></div>
                        {qualifyingMatchSetup.map((qualifyingPair, index) => (
                          <div key={`qualifying-${index}`} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-on-surface-variant">Qual {index + 1}</span>
                            {([0, 1] as const).map((slot) => <select key={slot} aria-label={`Qualifying match ${index + 1} slot ${slot === 0 ? 'A' : 'B'}`} value={qualifyingPair[slot]} onChange={(event) => setQualifyingMatchSetup((current) => current.map((row, rowIndex) => rowIndex === index ? row.map((value, valueIndex) => valueIndex === slot ? Number(event.target.value) : value) as [number, number] : row))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white">{seededPairs.map((pair, pairIndex) => <option key={pairIndex} value={pairIndex}>Pair #{pair.number}</option>)}</select>)}
                          </div>
                        ))}
                        {!validQualifyingMatchSetup && <p className="text-xs text-red-300">Use every numbered pair exactly once across the five qualifying matches.</p>}
                      </div>
                    )}
                    {session.format === 'qualifying_knockout' && manualPairs.length !== 10 && <p className="text-xs text-red-300">Qualifying knockout requires exactly 10 pairs.</p>}
                    <button type="button" disabled={busy || !buildManualPairPayload(manualPairs, groupAPlayers.map((player) => player.id), groupBPlayers.map((player) => player.id)) || (session.format === 'knockout' && !isValidKnockoutSetup(manualPairs.length, knockoutSetup)) || (session.format === 'qualifying_knockout' && (manualPairs.length !== 10 || !validQualifyingMatchSetup))} onClick={generateSchedule} className="w-full rounded-lg bg-primary-fixed px-4 py-2 text-xs font-black text-on-primary-fixed disabled:opacity-50">Generate {session.format === 'knockout' ? 'knockout bracket' : session.format === 'qualifying_knockout' ? 'qualifying matches' : 'match schedule'}</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div><p className="text-xs font-bold uppercase tracking-widest text-primary-fixed">Live · {formatName(session.format)}</p><h2 className="mt-1 text-xl font-black text-white">{session.name}</h2><p className="text-sm text-on-surface-variant">Scores save immediately to the public view. Ties are not accepted.</p></div>
                <button type="button" disabled={busy} onClick={returnToAttendance} className="w-fit text-xs font-bold text-red-300 underline disabled:opacity-50">Return to attendance</button>
                {session.format === 'knockout' ? (
                  <div className="space-y-3">
                    <KnockoutBracket teams={session.teams} matches={session.matches} renderMatch={(match, teamA, teamB) => teamA && teamB ? <MatchScoreRow key={matchScoreFormKey(match)} match={match} session={session} compact onSaved={async () => { await mutateSession(); onDataChanged(); }} /> : undefined} renderStageAction={renderBracketStageAction} />
                  </div>
                ) : session.format === 'qualifying_knockout' ? (
                  <div className="space-y-4">
                    <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3">
                      <div><h3 className="text-sm font-black text-white">Qualifying matches</h3><p className="mt-1 text-xs text-on-surface-variant">Complete all five matches. The lowest two teams by win %, point differential, points scored, then seed are eliminated.</p></div>
                      <StageDrawEditor sessionId={session.id} stage={{ matchKind: 'qualifier', bracketRound: null, placementGroup: null }} matches={qualifierMatches} teams={session.teams} label="qualifying matches" onSaved={onStageDrawSaved} />
                      {qualifierMatches.map((match) => <MatchScoreRow key={matchScoreFormKey(match)} match={match} session={session} onSaved={async () => { await mutateSession(); onDataChanged(); }} />)}
                    </div>
                    {qualifyingStandings.length > 0 && (
                      <div className="rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3">
                        <h3 className="text-sm font-black text-white">Qualifier standings</h3>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {qualifyingStandings.map((standing, index) => (
                            <div key={standing.team.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs ${standing.qualified ? 'bg-primary-fixed/10 text-white' : 'bg-red-950/30 text-red-100'}`}>
                              <span className="font-bold">{index + 1}. #{standing.seed} {standing.team.members.map((member) => member.name).join(' / ')}</span>
                              <span className="shrink-0 text-[10px] uppercase">{standing.qualified ? 'Top 8' : 'Eliminated'} · {standing.pointDifferential >= 0 ? '+' : ''}{standing.pointDifferential}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {qualifyingConsolationTeams.length === 2 && consolationMatches.length === 0 && (
                      <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3">
                        <div><h3 className="text-sm font-black text-white">Eliminated pair playoff</h3><p className="mt-1 text-xs text-on-surface-variant">The two eliminated pairs can still play and record their score after the knockout bracket starts.</p></div>
                        {consolationMatches.length > 0 ? (
                          consolationMatches.map((match) => <MatchScoreRow key={matchScoreFormKey(match)} match={match} session={session} onSaved={async () => { await mutateSession(); onDataChanged(); }} />)
                        ) : (
                          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container px-3 py-3 text-sm text-white">
                            <span className="font-bold">#{qualifyingConsolationTeams[0].seed} {qualifyingConsolationTeams[0].team.members.map((member) => member.name).join(' / ')}</span>
                            <span className="text-xs font-black text-on-surface-variant">vs</span>
                            <span className="text-right font-bold">#{qualifyingConsolationTeams[1].seed} {qualifyingConsolationTeams[1].team.members.map((member) => member.name).join(' / ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {bracketMatches.length > 0 ? (
                      <div className="space-y-3">
                        {canReturnToQuarterFinalConfig && (
                          <button type="button" disabled={busy} onClick={returnToQuarterFinalConfig} className="w-fit rounded-lg border border-red-300 px-4 py-2 text-xs font-black text-red-300 disabled:opacity-50">Return to quarter-final configuration</button>
                        )}
                        <KnockoutBracket teams={session.teams} matches={session.matches} renderMatch={(match, teamA, teamB) => teamA && teamB ? <MatchScoreRow key={matchScoreFormKey(match)} match={match} session={session} compact onSaved={async () => { await mutateSession(); onDataChanged(); }} /> : undefined} renderStageAction={renderBracketStageAction} />
                      </div>
                    ) : qualifyingBracketPending ? (
                      <div className="space-y-3 rounded-xl border border-primary-fixed/30 bg-primary-fixed/10 p-3">
                        <div><h3 className="text-sm font-black text-white">Configure quarter-final path</h3><p className="mt-1 text-xs text-on-surface-variant">Place any eight available teams into the quarter-final slots. Eliminated teams can replace qualified teams that cannot play.</p></div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {quarterFinalTeamIds.map((teamId, index) => (
                            <label key={index} className="text-[10px] font-bold uppercase text-on-surface-variant">Quarter-final slot {index + 1}
                              <select aria-label={`Qualifier quarter-final slot ${index + 1}`} value={teamId} onChange={(event) => setQuarterFinalTeamIds((current) => current.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry))} className="mt-1 w-full rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs font-normal normal-case text-white">
                                {getAvailableQuarterFinalTeamIds(qualifyingStandings).map((candidateTeamId) => {
                                  const standing = qualifyingStandings.find((entry) => entry.team.id === candidateTeamId);
                                  return standing ? <option key={standing.team.id} value={standing.team.id}>#{standing.seed} {standing.team.members.map((member) => member.name).join(' / ')} · {standing.qualified ? 'Top 8' : 'Eliminated'}</option> : null;
                                })}
                              </select>
                            </label>
                          ))}
                        </div>
                        {!validQuarterFinalSelection && <p className="text-xs text-red-300">Choose eight unique teams for the quarter-final slots.</p>}
                        <button type="button" disabled={busy || !isValidKnockoutSetup(8, knockoutSetup) || !validQuarterFinalSelection} onClick={startQualifyingKnockout} className="w-full rounded-lg bg-primary-fixed px-4 py-2 text-xs font-black text-on-primary-fixed disabled:opacity-50">Start quarter-final bracket</button>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3 text-xs text-amber-200">Complete all qualifying matches to unlock the top-eight knockout bracket.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <StageDrawEditor sessionId={session.id} stage={{ matchKind: 'round_robin', bracketRound: null, placementGroup: null }} matches={session.matches} teams={session.teams} label="round robin" onSaved={onStageDrawSaved} />
                    {session.matches.map((match) => <MatchScoreRow key={matchScoreFormKey(match)} match={match} session={session} onSaved={async () => { await mutateSession(); onDataChanged(); }} />)}
                  </div>
                )}
                <button type="button" disabled={busy || session.matches.some((match) => match.status !== 'completed') || qualifyingBracketPending} onClick={() => runAction(() => adminRequest('/api/admin/sessions', { method: 'POST', body: JSON.stringify({ action: 'finalize', sessionId: session.id }) }), 'Session finalized and points awarded once.')} className="w-full rounded-lg bg-primary-fixed px-5 py-3 text-sm font-black text-on-primary-fixed disabled:cursor-not-allowed disabled:opacity-40">Finalize session and award points</button>
              </>
            )}
          </section>
        </div>
      )}

      {membership.role === 'superadmin' && (
        <section className="grid gap-5 rounded-2xl border border-outline-variant/20 bg-surface-container p-5 lg:grid-cols-[0.7fr_1.3fr]">
          <form onSubmit={inviteAdmin} className="space-y-3"><div><p className="text-xs font-bold uppercase tracking-widest text-primary-fixed">Access control</p><h2 className="mt-1 text-xl font-black text-white">Invite administrator</h2></div><input name="email" type="email" required placeholder="admin@example.com" className="w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" /><select name="role" className="w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white"><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select><button disabled={busy} className="w-full rounded-lg border border-primary-fixed px-4 py-2 text-sm font-black text-primary-fixed disabled:opacity-50">Send Supabase invitation</button></form>
          <div>
            <h3 className="text-sm font-black text-white">Current administrators</h3>
            <div className="mt-3 space-y-2">
              {memberData?.memberships.map((member) => (
                <div key={member.id} className="rounded-lg bg-surface-dim/60 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3"><span className="truncate text-white">{member.email}</span><span className="shrink-0 text-[10px] uppercase text-on-surface-variant">{member.role} · {member.status}</span></div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => updateMember(member, { role: member.role === 'admin' ? 'superadmin' : 'admin' })} className="text-[10px] font-bold text-primary-fixed underline disabled:opacity-50">{member.role === 'admin' ? 'Promote' : 'Demote'}</button>
                    <button type="button" disabled={busy} onClick={() => updateMember(member, { status: member.status === 'active' ? 'disabled' : 'active' })} className="text-[10px] font-bold text-primary-fixed underline disabled:opacity-50">{member.status === 'active' ? 'Disable' : 'Enable'}</button>
                    <button type="button" disabled={busy} onClick={() => updateMember(member, { revokeSessions: true })} className="text-[10px] font-bold text-red-300 underline disabled:opacity-50">Revoke sessions</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
