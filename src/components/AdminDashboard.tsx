import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { adminRequest, ApiError } from '../lib/api';
import DateTimePicker from './DateTimePicker';
import { useActivity } from '../lib/activity';
import KnockoutBracket from './KnockoutBracket';

interface Membership {
  id: string;
  email: string;
  role: 'admin' | 'superadmin';
  status: 'active' | 'disabled';
}

interface AdminPlayer {
  id: string;
  name: string;
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
}

interface AdminSession {
  id: string;
  name: string;
  scheduledAt: string;
  format: 'round_robin' | 'knockout';
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
    setBusy(true);
    setError('');
    try {
      await track(() => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'score',
          matchId: match.id,
          scoreA: Number(scoreA),
          scoreB: Number(scoreB),
          court: court || null,
        }),
      }));
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

export function sortPlayersByPoints(players: readonly AdminPlayer[]): AdminPlayer[] {
  return [...players].sort(
    (left, right) => right.points - left.points || left.name.localeCompare(right.name),
  );
}

export function createManualPairRows(groupAIds: string[], groupBIds: string[]): ManualPairRow[] {
  if (groupAIds.length !== groupBIds.length) return [];
  return groupAIds.map((groupAPlayerId, index) => ({
    number: String(index + 1),
    groupAPlayerId,
    groupBPlayerId: groupBIds[index],
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

export default function AdminDashboard({ membership, onDataChanged }: AdminDashboardProps) {
  const { reportError, track } = useActivity();
  const { data: seasonData, mutate: mutateSeasons } = useSWR<{
    seasons: Array<{
      id: string;
      name: string;
      status: string;
      winPoints: number;
      lossPoints: number;
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

  useEffect(() => {
    setManualPairs(createManualPairRows(
      groupAPlayers.map((player) => player.id),
      groupBPlayers.map((player) => player.id),
    ));
  }, [selectedPlayers, groupOverrides, players]);

  useEffect(() => {
    setKnockoutSetup(createDefaultKnockoutSetup(manualPairs.length));
  }, [manualPairs.length, session?.format]);

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
    await runAction(
      () => adminRequest('/api/admin/seasons', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          startsAt: new Date(String(form.get('startsAt'))).toISOString(),
          winPoints: Number(form.get('winPoints')),
          lossPoints: Number(form.get('lossPoints')),
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
          displayRating: form.get('displayRating'),
          clubSkill: Number(form.get('clubSkill')),
          openingPoints: Number(form.get('openingPoints')),
        }),
      }),
      'Player added to the active season.',
    );
    if (succeeded) formElement.reset();
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

  async function adjustPoints(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const succeeded = await runAction(
      () =>
        adminRequest('/api/admin/points', {
          method: 'POST',
          body: JSON.stringify({
            playerId: form.get('playerId'),
            points: Number(form.get('points')),
            notes: form.get('notes'),
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      'Point adjustment added to the ledger.',
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
    await runAction(
      () => adminRequest('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'draw',
          sessionId: session.id,
          pairs,
          knockoutConfig: session.format === 'knockout' ? knockoutSetup : undefined,
        }),
      }),
      'Match schedule published.',
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
    await runAction(
      () =>
        adminRequest('/api/admin/seasons', {
          method: 'PATCH',
          body: JSON.stringify({
            seasonId: activeSeason.id,
            winPoints: Number(form.get('winPoints')),
            lossPoints: Number(form.get('lossPoints')),
          }),
        }),
      'Default season awards updated. Existing sessions keep their snapshots.',
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
          <div className="md:col-span-2"><h2 className="text-xl font-black text-white">Create the first season</h2><p className="mt-1 text-sm text-on-surface-variant">The app starts empty. These award values are snapshotted into each new session.</p></div>
          <label className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
            Season name
            <input name="name" required placeholder="e.g. Winter League 2026" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 font-normal normal-case tracking-normal text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30" />
          </label>
          <DateTimePicker name="startsAt" label="Season starts" required />
          <label className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
            Winner points
            <input name="winPoints" type="number" min="0" step="0.1" defaultValue="150" required className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 font-normal normal-case tracking-normal text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
            Loser points
            <input name="lossPoints" type="number" min="0" step="0.1" defaultValue="30" required className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 font-normal normal-case tracking-normal text-white outline-none transition focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30" />
          </label>
          <button disabled={busy} className="rounded-lg bg-primary-fixed px-5 py-3 text-sm font-black text-on-primary-fixed md:col-span-2 disabled:opacity-50">Create season</button>
        </form>
      )}

      {activeSeason && (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container p-5">
            <div><p className="text-xs font-bold uppercase tracking-widest text-primary-fixed">{activeSeason.name}</p><h2 className="mt-1 text-xl font-black text-white">Season roster</h2></div>
            {membership.role === 'superadmin' && (
              <form onSubmit={updateSeason} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3">
                <label className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Win points<input name="winPoints" type="number" min="0" step="0.1" defaultValue={activeSeason.winPoints} required className="mt-1 w-full rounded border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-white" /></label>
                <label className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Loss points<input name="lossPoints" type="number" min="0" step="0.1" defaultValue={activeSeason.lossPoints} required className="mt-1 w-full rounded border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-white" /></label>
                <button disabled={busy} className="rounded border border-primary-fixed px-3 py-2 text-xs font-black text-primary-fixed disabled:opacity-50">Save</button>
              </form>
            )}
            <form onSubmit={addPlayer} className="grid gap-3 sm:grid-cols-2">
              <input name="name" required placeholder="Player name" className="rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" />
              <input name="displayRating" required placeholder="Display rating, e.g. NTRP 4.0" className="rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" />
              <label className="text-xs text-on-surface-variant">Club skill 1-10<input name="clubSkill" type="number" min="1" max="10" defaultValue="5" required className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-on-surface-variant">Opening points<input name="openingPoints" type="number" step="0.1" defaultValue="0" required className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-dim px-3 py-2 text-sm text-white" /></label>
              <button disabled={busy} className="rounded-lg border border-primary-fixed px-4 py-2 text-sm font-black text-primary-fixed sm:col-span-2 disabled:opacity-50">Add player</button>
            </form>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {sortedPlayers.map((player) => <div key={player.id} className="flex items-center justify-between rounded-lg bg-surface-dim/60 px-3 py-2 text-sm"><span className="font-bold text-white">{player.name}</span><span className="text-xs text-on-surface-variant">Skill {player.clubSkill} · {player.points} pts</span></div>)}
              {!players.length && <p className="py-5 text-center text-sm text-on-surface-variant">No players yet.</p>}
            </div>
            {players.length > 0 && (
              <form onSubmit={adjustPoints} className="grid gap-2 rounded-xl border border-outline-variant/20 bg-surface-dim/40 p-3 sm:grid-cols-2">
                <p className="text-xs font-black text-white sm:col-span-2">Append point adjustment</p>
                <select name="playerId" required className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white">{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select>
                <input name="points" type="number" step="0.1" required placeholder="Points, e.g. -10.5" className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white" />
                <input name="notes" required placeholder="Reason for adjustment" className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white sm:col-span-2" />
                <button disabled={busy} className="rounded border border-primary-fixed px-3 py-2 text-xs font-black text-primary-fixed sm:col-span-2 disabled:opacity-50">Add ledger entry</button>
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
                    </select>
                  </label>
                  <button disabled={busy} className="rounded-lg bg-primary-fixed px-4 py-2 text-sm font-black text-on-primary-fixed sm:col-span-2 disabled:opacity-50">Create session</button>
                </form>
                {session?.status === 'finalized' && membership.role === 'superadmin' && <button type="button" disabled={busy} onClick={() => runAction(() => adminRequest('/api/admin/sessions', { method: 'POST', body: JSON.stringify({ action: 'void', sessionId: session.id, reason: 'Voided by superadministrator from the control console', createReplacement: true }) }), 'Session voided and replacement draft created.')} className="text-xs font-bold text-red-300 underline">Void finalized session and create replacement</button>}
              </>
            ) : session.status === 'draft' ? (
              <>
                <div><p className="text-xs font-bold uppercase tracking-widest text-primary-fixed">Draft · {session.format === 'knockout' ? 'Knockout' : 'Round robin'}</p><h2 className="mt-1 text-xl font-black text-white">{session.name}</h2><p className="text-sm text-on-surface-variant">Choose attendees, assign every player to A or B, save attendance, then configure each numbered pair.</p></div>
                <p className="text-sm font-bold text-white" aria-live="polite">
                  {attendeeGroups.attendees} attendees · A: {attendeeGroups.groupA} · B: {attendeeGroups.groupB} · Auto: {attendeeGroups.auto}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sortedPlayers.filter((player) => player.active).map((player) => (
                    <div key={player.id} className="flex items-center gap-2 rounded-lg bg-surface-dim/60 p-2">
                      <input type="checkbox" checked={selectedPlayers.has(player.id)} onChange={(event) => { setAttendanceDirty(true); setSelectedPlayers((current) => { const next = new Set(current); event.target.checked ? next.add(player.id) : next.delete(player.id); return next; }); }} aria-label={`Include ${player.name}`} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{player.name}</span>
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
                    <h3 className="text-sm font-black text-white">Configure numbered pairs</h3>
                    {manualPairs.map((pair, index) => (
                      <div key={index} className="grid grid-cols-[5rem_1fr_1fr] gap-2">
                        <input aria-label={`Pair ${index + 1} number`} type="number" min="1" step="1" value={pair.number} onChange={(event) => setManualPairs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, number: event.target.value } : row))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white" />
                        <select aria-label={`Pair ${index + 1} group A player`} value={pair.groupAPlayerId} onChange={(event) => setManualPairs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, groupAPlayerId: event.target.value } : row))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white">{groupAPlayers.map((player) => <option key={player.id} value={player.id}>A · {player.name}</option>)}</select>
                        <select aria-label={`Pair ${index + 1} group B player`} value={pair.groupBPlayerId} onChange={(event) => setManualPairs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, groupBPlayerId: event.target.value } : row))} className="rounded border border-outline-variant bg-surface-container px-2 py-2 text-xs text-white">{groupBPlayers.map((player) => <option key={player.id} value={player.id}>B · {player.name}</option>)}</select>
                      </div>
                    ))}
                    {session.format === 'knockout' && (
                      <div className="space-y-3 border-t border-outline-variant/20 pt-3">
                        <div><h4 className="text-xs font-black uppercase tracking-wider text-primary-fixed">Knockout path</h4><p className="mt-1 text-[11px] text-on-surface-variant">Override preliminary matchups and place every bye seed or preliminary winner into the main bracket.</p></div>
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
                    <button type="button" disabled={busy || !buildManualPairPayload(manualPairs, groupAPlayers.map((player) => player.id), groupBPlayers.map((player) => player.id)) || (session.format === 'knockout' && !isValidKnockoutSetup(manualPairs.length, knockoutSetup))} onClick={generateSchedule} className="w-full rounded-lg bg-primary-fixed px-4 py-2 text-xs font-black text-on-primary-fixed disabled:opacity-50">Generate {session.format === 'knockout' ? 'knockout bracket' : 'match schedule'}</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div><p className="text-xs font-bold uppercase tracking-widest text-primary-fixed">Live · {session.format === 'knockout' ? 'Knockout' : 'Round robin'}</p><h2 className="mt-1 text-xl font-black text-white">{session.name}</h2><p className="text-sm text-on-surface-variant">Scores save immediately to the public view. Ties are not accepted.</p></div>
                <button type="button" disabled={busy} onClick={returnToAttendance} className="w-fit text-xs font-bold text-red-300 underline disabled:opacity-50">Return to attendance</button>
                {session.format === 'knockout' ? (
                  <KnockoutBracket teams={session.teams} matches={session.matches} renderMatch={(match, teamA, teamB) => teamA && teamB ? <MatchScoreRow match={match} session={session} compact onSaved={async () => { await mutateSession(); onDataChanged(); }} /> : undefined} />
                ) : (
                  <div className="space-y-3">{session.matches.map((match) => <MatchScoreRow key={match.id} match={match} session={session} onSaved={async () => { await mutateSession(); onDataChanged(); }} />)}</div>
                )}
                <button type="button" disabled={busy || session.matches.some((match) => match.status !== 'completed')} onClick={() => runAction(() => adminRequest('/api/admin/sessions', { method: 'POST', body: JSON.stringify({ action: 'finalize', sessionId: session.id }) }), 'Session finalized and points awarded once.')} className="w-full rounded-lg bg-primary-fixed px-5 py-3 text-sm font-black text-on-primary-fixed disabled:cursor-not-allowed disabled:opacity-40">Finalize session and award points</button>
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
