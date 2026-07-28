import { useEffect, useId, useRef, useState } from 'react';
import { adminRequest } from '../lib/api';

export type StageMatchKind = 'round_robin' | 'qualifier' | 'championship' | 'placement';

export interface StageKey {
  matchKind: StageMatchKind;
  bracketRound: number | null;
  placementGroup: number | null;
}

export interface StageSnapshot {
  matchId: string;
  teamAId: string;
  teamBId: string;
  sequence: number;
}

export interface StageDrawMatch {
  id: string;
  sequence: number;
  teamAId: string | null;
  teamBId: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  matchKind?: StageMatchKind;
  bracketRound: number | null;
  placementGroup?: number | null;
}

export interface EditableStage {
  key: StageKey;
  matches: StageDrawMatch[];
}

export interface StageDrawTeam {
  id: string;
  seed: number;
  members: Array<{ name: string }>;
}

function stageKey(match: StageDrawMatch): StageKey | null {
  if (!match.matchKind) return null;
  return {
    matchKind: match.matchKind,
    bracketRound: match.bracketRound ?? null,
    placementGroup: match.placementGroup ?? null,
  };
}

function stageKeyId(key: StageKey): string {
  return JSON.stringify([key.matchKind, key.bracketRound, key.placementGroup]);
}

function sameStage(left: StageKey, right: StageKey): boolean {
  return stageKeyId(left) === stageKeyId(right);
}

export function discoverEditableStages(matches: readonly StageDrawMatch[]): EditableStage[] {
  const groups = new Map<string, EditableStage>();
  for (const match of matches) {
    const key = stageKey(match);
    if (!key) continue;
    const id = stageKeyId(key);
    const group = groups.get(id) ?? { key, matches: [] };
    group.matches.push(match);
    groups.set(id, group);
  }

  return [...groups.values()]
    .filter((stage) => stage.matches.every((match) => (
      match.status === 'pending' && Boolean(match.teamAId) && Boolean(match.teamBId)
    )))
    .map((stage) => ({
      ...stage,
      matches: [...stage.matches].sort((left, right) => left.sequence - right.sequence),
    }))
    .sort((left, right) => left.matches[0].sequence - right.matches[0].sequence);
}

function snapshotMatches(matches: readonly StageDrawMatch[]): StageSnapshot[] {
  return matches.map((match) => ({
    matchId: match.id,
    teamAId: match.teamAId!,
    teamBId: match.teamBId!,
    sequence: match.sequence,
  }));
}

export function buildAdjustStageDrawRequest(
  sessionId: string,
  stage: StageKey,
  expectedMatches: readonly StageSnapshot[],
  matches: readonly StageSnapshot[],
): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify({
      action: 'adjust_stage_draw',
      sessionId,
      stage,
      expectedMatches,
      matches,
    }),
  };
}

function sorted(values: readonly (string | number)[]): string {
  return [...values]
    .sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }))
    .join('\0');
}

export function validateStageDraft(
  stage: StageKey,
  expected: readonly StageSnapshot[],
  draft: readonly StageSnapshot[],
): string | null {
  const expectedIds = expected.map((match) => match.matchId);
  const draftIds = draft.map((match) => match.matchId);
  if (draft.length !== expected.length
    || new Set(draftIds).size !== draft.length
    || sorted(draftIds) !== sorted(expectedIds)) {
    return 'Keep every match in this stage exactly once.';
  }

  const expectedById = new Map(expected.map((match) => [match.matchId, match]));
  if (stage.matchKind === 'round_robin') {
    for (const match of draft) {
      const current = expectedById.get(match.matchId)!;
      if (sorted([match.teamAId, match.teamBId]) !== sorted([current.teamAId, current.teamBId])) {
        return 'Each round-robin match must keep the same opponent pair.';
      }
    }
    if (sorted(draft.map((match) => match.sequence)) !== sorted(expected.map((match) => match.sequence))) {
      return 'Use each existing round-robin sequence exactly once.';
    }
    return null;
  }

  if (draft.some((match) => match.teamAId === match.teamBId)) {
    return 'A team cannot play itself.';
  }
  const expectedTeamIds = expected.flatMap((match) => [match.teamAId, match.teamBId]);
  const draftTeamIds = draft.flatMap((match) => [match.teamAId, match.teamBId]);
  if (new Set(draftTeamIds).size !== draftTeamIds.length) {
    return 'Use every team in this stage exactly once.';
  }
  if (sorted(draftTeamIds) !== sorted(expectedTeamIds)) {
    return 'Use the exact existing team cohort with no missing or outside teams.';
  }
  if (draft.some((match) => match.sequence !== expectedById.get(match.matchId)!.sequence)) {
    return 'Match sequence values cannot change in this stage.';
  }
  return null;
}

export function moveRoundRobinMatch(
  draft: readonly StageSnapshot[],
  matchId: string,
  direction: 'up' | 'down',
): StageSnapshot[] {
  const ordered = [...draft].sort((left, right) => left.sequence - right.sequence);
  const currentIndex = ordered.findIndex((match) => match.matchId === matchId);
  const targetIndex = currentIndex + (direction === 'up' ? -1 : 1);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return [...draft];
  const currentSequence = ordered[currentIndex].sequence;
  const targetSequence = ordered[targetIndex].sequence;
  const targetId = ordered[targetIndex].matchId;
  return draft.map((match) => {
    if (match.matchId === matchId) return { ...match, sequence: targetSequence };
    if (match.matchId === targetId) return { ...match, sequence: currentSequence };
    return match;
  });
}

export function swapRoundRobinSides(
  draft: readonly StageSnapshot[],
  matchId: string,
): StageSnapshot[] {
  return draft.map((match) => match.matchId === matchId
    ? { ...match, teamAId: match.teamBId, teamBId: match.teamAId }
    : match);
}

function teamName(team: StageDrawTeam | undefined): string {
  return team ? `#${team.seed} ${team.members.map((member) => member.name).join(' / ')}` : 'Unknown team';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The draw could not be saved.';
}

export function StageDrawEditor({
  sessionId,
  stage,
  matches,
  teams,
  label,
  onSaved,
}: {
  sessionId: string;
  stage: StageKey;
  matches: readonly StageDrawMatch[];
  teams: readonly StageDrawTeam[];
  label: string;
  onSaved: () => void | Promise<void>;
}) {
  const [expected, setExpected] = useState<StageSnapshot[] | null>(null);
  const [draft, setDraft] = useState<StageSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const validationMessageId = useId();
  const editableStage = discoverEditableStages(matches).find((candidate) => sameStage(candidate.key, stage));

  useEffect(() => {
    if (expected) {
      cancelRef.current?.focus();
    } else if (restoreFocusRef.current) {
      triggerRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [expected]);

  if (!editableStage) return null;

  function openEditor() {
    const captured = snapshotMatches(editableStage!.matches);
    restoreFocusRef.current = true;
    setExpected(captured);
    setDraft(captured.map((match) => ({ ...match })));
    setApiError('');
  }

  function closeEditor() {
    setExpected(null);
    setDraft([]);
    setApiError('');
  }

  if (!expected) {
    return (
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Adjust ${label} draw`}
        onClick={openEditor}
        className="min-h-11 rounded-lg border border-tertiary-fixed/50 bg-tertiary-fixed/10 px-3 py-2 text-xs font-black text-tertiary-fixed transition-colors hover:bg-tertiary-fixed/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-fixed"
      >
        Adjust draw
      </button>
    );
  }

  const validationError = validateStageDraft(stage, expected, draft);
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const cohortIds = expected.flatMap((match) => [match.teamAId, match.teamBId]);
  const orderedDraft = [...draft].sort((left, right) => left.sequence - right.sequence);

  async function saveDraw() {
    if (validationError) return;
    setBusy(true);
    setApiError('');
    try {
      await adminRequest('/api/admin/sessions', buildAdjustStageDrawRequest(sessionId, stage, expected!, draft));
      await onSaved();
      closeEditor();
    } catch (error) {
      setApiError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="region"
      aria-label={`Adjust ${label} draw`}
      className="rounded-xl border border-tertiary-fixed/35 bg-tertiary-fixed/10 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-tertiary-fixed">Adjust {label} draw</h4>
          <p className="mt-1 text-xs text-on-surface-variant">
            {stage.matchKind === 'round_robin'
              ? 'Reorder matches or swap sides before play starts.'
              : 'Reassign this stage before its first match starts.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={closeEditor}
            className="min-h-11 rounded-lg border border-outline-variant px-3 py-2 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            aria-describedby={validationError ? validationMessageId : undefined}
            disabled={busy || Boolean(validationError)}
            onClick={() => void saveDraw()}
            className="min-h-11 rounded-lg bg-tertiary-fixed px-3 py-2 text-xs font-black text-on-tertiary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-fixed disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save draw'}
          </button>
        </div>
      </div>

      {stage.matchKind === 'round_robin' ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {orderedDraft.map((match, index) => (
            <div key={match.matchId} className="rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2">
              <p className="truncate text-xs font-bold text-white">
                Match {match.sequence} · {teamName(teamMap.get(match.teamAId))} vs {teamName(teamMap.get(match.teamBId))}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy || index === 0} onClick={() => setDraft((current) => moveRoundRobinMatch(current, match.matchId, 'up'))} className="min-h-11 rounded border border-outline-variant px-2 py-1 text-[11px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40">Move up</button>
                <button type="button" disabled={busy || index === orderedDraft.length - 1} onClick={() => setDraft((current) => moveRoundRobinMatch(current, match.matchId, 'down'))} className="min-h-11 rounded border border-outline-variant px-2 py-1 text-[11px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40">Move down</button>
                <button type="button" disabled={busy} onClick={() => setDraft((current) => swapRoundRobinSides(current, match.matchId))} className="min-h-11 rounded border border-outline-variant px-2 py-1 text-[11px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40">Swap sides</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {orderedDraft.map((match) => (
            <div key={match.matchId} className="grid grid-cols-2 gap-2 rounded-lg border border-outline-variant/30 bg-surface-container p-2">
              {(['A', 'B'] as const).map((slot) => (
                <label key={slot} className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Match {match.sequence} team {slot}
                  <select
                    aria-label={`Match ${match.sequence} team ${slot}`}
                    value={slot === 'A' ? match.teamAId : match.teamBId}
                    disabled={busy}
                    onChange={(event) => setDraft((current) => current.map((entry) => entry.matchId === match.matchId
                      ? { ...entry, [slot === 'A' ? 'teamAId' : 'teamBId']: event.target.value }
                      : entry))}
                    className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-dim px-2 py-2 text-xs font-normal normal-case text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-fixed"
                  >
                    {cohortIds.map((teamId, optionIndex) => <option key={`${teamId}-${optionIndex}`} value={teamId}>{teamName(teamMap.get(teamId))}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {validationError && <p id={validationMessageId} role="alert" className="mt-2 text-xs text-red-300">{validationError}</p>}
      {apiError && <p role="alert" className="mt-2 text-xs text-red-300">{apiError}</p>}
    </section>
  );
}
