export type StageMatchKind = 'round_robin' | 'qualifier' | 'championship' | 'placement';
export type StageSlot = 'A' | 'B';

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

export interface StageMatchRow {
  id: string;
  matchKind: StageMatchKind;
  bracketRound: number | null;
  placementGroup: number | null;
  sequence: number;
  status: string;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  nextMatchId: string | null;
  winnerToSlot: StageSlot | null;
  loserNextMatchId: string | null;
  loserToSlot: StageSlot | null;
}

export type StageDrawErrorCode =
  | 'stage_unavailable'
  | 'stale_stage_draw'
  | 'invalid_stage_draw';

export abstract class StageDrawError extends Error {
  abstract readonly code: StageDrawErrorCode;
}

export class StageDrawUnavailableError extends StageDrawError {
  readonly code = 'stage_unavailable' as const;

  constructor(message: string) {
    super(message);
    this.name = 'StageDrawUnavailableError';
  }
}

export class StageDrawStaleError extends StageDrawError {
  readonly code = 'stale_stage_draw' as const;

  constructor(message: string) {
    super(message);
    this.name = 'StageDrawStaleError';
  }
}

export class StageDrawValidationError extends StageDrawError {
  readonly code = 'invalid_stage_draw' as const;

  constructor(message: string) {
    super(message);
    this.name = 'StageDrawValidationError';
  }
}

export type StageFeederRouteUpdate = {
  matchId: string;
  outcome: 'winner' | 'loser';
  nextMatchId: string;
  toSlot: StageSlot;
};

export interface StageDrawAdjustmentPlan {
  slotUpdates: StageSnapshot[];
  routeUpdates: StageFeederRouteUpdate[];
}

export interface PlanStageDrawAdjustmentInput {
  sessionStatus: string;
  stage: StageKey;
  matches: readonly StageMatchRow[];
  expected: readonly StageSnapshot[];
  desired: readonly StageSnapshot[];
}

interface FeederOrigin {
  match: StageMatchRow;
  outcome: 'winner' | 'loser';
  targetMatchId: string;
  targetSlot: StageSlot;
  teamId: string;
}

function isSelectedStage(match: StageMatchRow, stage: StageKey): boolean {
  return match.matchKind === stage.matchKind
    && match.bracketRound === stage.bracketRound
    && match.placementGroup === stage.placementGroup;
}

function validSnapshot(snapshot: StageSnapshot): boolean {
  return typeof snapshot.matchId === 'string'
    && snapshot.matchId.length > 0
    && typeof snapshot.teamAId === 'string'
    && snapshot.teamAId.length > 0
    && typeof snapshot.teamBId === 'string'
    && snapshot.teamBId.length > 0
    && Number.isInteger(snapshot.sequence);
}

function hasExactlyMatchIds(
  snapshots: readonly StageSnapshot[],
  matchIds: ReadonlySet<string>,
): boolean {
  if (snapshots.length !== matchIds.size || snapshots.some((snapshot) => !validSnapshot(snapshot))) {
    return false;
  }
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.matchId));
  return snapshotIds.size === matchIds.size
    && [...snapshotIds].every((matchId) => matchIds.has(matchId));
}

function sorted(values: readonly (string | number)[]): string {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true })).join('\u0000');
}

function assertExpectedCurrent(
  stageMatches: readonly StageMatchRow[],
  expected: readonly StageSnapshot[],
): void {
  const matchIds = new Set(stageMatches.map((match) => match.id));
  if (!hasExactlyMatchIds(expected, matchIds)) {
    throw new StageDrawStaleError('This stage changed while it was being edited. Refresh the session and try again.');
  }
  const currentById = new Map(stageMatches.map((match) => [match.id, match]));
  if (expected.some((snapshot) => {
    const current = currentById.get(snapshot.matchId)!;
    return snapshot.teamAId !== current.teamAId
      || snapshot.teamBId !== current.teamBId
      || snapshot.sequence !== current.sequence;
  })) {
    throw new StageDrawStaleError('This stage changed while it was being edited. Refresh the session and try again.');
  }
}

function assertDesiredMatchIds(
  desired: readonly StageSnapshot[],
  matchIds: ReadonlySet<string>,
): void {
  if (!hasExactlyMatchIds(desired, matchIds)) {
    throw new StageDrawValidationError('The adjusted draw must contain exactly this stage\'s match IDs once each.');
  }
}

function assertRoutePair(
  targetMatchId: string | null,
  targetSlot: StageSlot | null,
  outcomeLabel: string,
): void {
  if ((targetMatchId === null) !== (targetSlot === null)) {
    throw new StageDrawValidationError(`A ${outcomeLabel} feeder route is malformed: its target match and slot must both be set.`);
  }
}

function resolvedOutcomeTeam(match: StageMatchRow, outcome: 'winner' | 'loser'): string {
  if (match.status !== 'completed'
    || !match.teamAId
    || !match.teamBId
    || match.scoreA === null
    || match.scoreB === null) {
    throw new StageDrawValidationError('Every feeder must be completed with both teams and a full score before this stage can be adjusted.');
  }
  if (match.scoreA === match.scoreB) {
    throw new StageDrawValidationError(`Feeder match ${match.id} has a tied score, so its winner and loser cannot be resolved.`);
  }
  const teamAWon = match.scoreA > match.scoreB;
  if (outcome === 'winner') return teamAWon ? match.teamAId : match.teamBId;
  return teamAWon ? match.teamBId : match.teamAId;
}

function collectFeederOrigins(
  matches: readonly StageMatchRow[],
  stageMatchIds: ReadonlySet<string>,
): Map<string, FeederOrigin[]> {
  const originsByTargetSlot = new Map<string, FeederOrigin[]>();
  const addOrigin = (
    match: StageMatchRow,
    outcome: 'winner' | 'loser',
    targetMatchId: string | null,
    targetSlot: StageSlot | null,
  ) => {
    if (!targetMatchId || !stageMatchIds.has(targetMatchId)) return;
    assertRoutePair(targetMatchId, targetSlot, outcome);
    if (!targetSlot) return;
    const origin: FeederOrigin = {
      match,
      outcome,
      targetMatchId,
      targetSlot,
      teamId: resolvedOutcomeTeam(match, outcome),
    };
    const key = `${targetMatchId}:${targetSlot}`;
    originsByTargetSlot.set(key, [...(originsByTargetSlot.get(key) ?? []), origin]);
  };

  for (const match of matches) {
    addOrigin(match, 'winner', match.nextMatchId, match.winnerToSlot);
    addOrigin(match, 'loser', match.loserNextMatchId, match.loserToSlot);
  }
  return originsByTargetSlot;
}

function planRoundRobin(
  stageMatches: readonly StageMatchRow[],
  desiredById: ReadonlyMap<string, StageSnapshot>,
): StageDrawAdjustmentPlan {
  for (const current of stageMatches) {
    const desired = desiredById.get(current.id)!;
    const currentPair = sorted([current.teamAId!, current.teamBId!]);
    const desiredPair = sorted([desired.teamAId, desired.teamBId]);
    if (currentPair !== desiredPair) {
      throw new StageDrawValidationError(`Round-robin match ${current.id} must keep the same opponent pair.`);
    }
  }

  const currentSequences = sorted(stageMatches.map((match) => match.sequence));
  const desiredSequences = sorted(stageMatches.map((match) => desiredById.get(match.id)!.sequence));
  if (currentSequences !== desiredSequences) {
    throw new StageDrawValidationError('Round-robin sequence values must be an exact permutation of the current stage sequences.');
  }

  return {
    slotUpdates: stageMatches.map((match) => ({ ...desiredById.get(match.id)! })),
    routeUpdates: [],
  };
}

function planBracketLike(
  matches: readonly StageMatchRow[],
  stageMatches: readonly StageMatchRow[],
  desiredById: ReadonlyMap<string, StageSnapshot>,
): StageDrawAdjustmentPlan {
  const currentTeamIds = stageMatches.flatMap((match) => [match.teamAId!, match.teamBId!]);
  if (stageMatches.some((match) => match.teamAId === match.teamBId)
    || new Set(currentTeamIds).size !== currentTeamIds.length) {
    throw new StageDrawValidationError('The current stage is malformed: every team must appear exactly once and cannot play itself.');
  }

  const desiredSnapshots = stageMatches.map((match) => desiredById.get(match.id)!);
  if (desiredSnapshots.some((snapshot) => snapshot.teamAId === snapshot.teamBId)) {
    throw new StageDrawValidationError('A team cannot be matched against itself.');
  }
  const desiredTeamIds = desiredSnapshots.flatMap((snapshot) => [snapshot.teamAId, snapshot.teamBId]);
  if (new Set(desiredTeamIds).size !== desiredTeamIds.length) {
    throw new StageDrawValidationError('Every team in this stage must be used exactly once.');
  }
  if (sorted(currentTeamIds) !== sorted(desiredTeamIds)) {
    throw new StageDrawValidationError('The adjusted draw must use the exact existing team cohort, with no missing or outside teams.');
  }
  if (stageMatches.some((match) => desiredById.get(match.id)!.sequence !== match.sequence)) {
    throw new StageDrawValidationError('Sequence values in this stage must remain tied to their existing match IDs.');
  }

  const stageMatchIds = new Set(stageMatches.map((match) => match.id));
  const originsByTargetSlot = collectFeederOrigins(matches, stageMatchIds);
  const originByTeamId = new Map<string, FeederOrigin>();
  for (const target of stageMatches) {
    for (const slot of ['A', 'B'] as const) {
      const targetTeamId = slot === 'A' ? target.teamAId! : target.teamBId!;
      const origins = originsByTargetSlot.get(`${target.id}:${slot}`) ?? [];
      if (origins.length > 1) {
        throw new StageDrawValidationError(`Match ${target.id} slot ${slot} must have exactly one feeder origin, not ${origins.length}.`);
      }
      if (origins.length === 1) {
        const origin = origins[0];
        if (origin.teamId !== targetTeamId) {
          throw new StageDrawValidationError(`The ${origin.outcome} from feeder ${origin.match.id} does not match the current team in match ${target.id} slot ${slot}.`);
        }
        originByTeamId.set(targetTeamId, origin);
      }
    }
  }

  const slotUpdates = desiredSnapshots.map((snapshot) => ({ ...snapshot }));
  const routeUpdates: StageFeederRouteUpdate[] = [];
  for (const update of slotUpdates) {
    for (const [toSlot, teamId] of [['A', update.teamAId], ['B', update.teamBId]] as const) {
      const origin = originByTeamId.get(teamId);
      if (!origin || (origin.targetMatchId === update.matchId && origin.targetSlot === toSlot)) continue;
      routeUpdates.push({
        matchId: origin.match.id,
        outcome: origin.outcome,
        nextMatchId: update.matchId,
        toSlot,
      });
    }
  }
  return { slotUpdates, routeUpdates };
}

export function planStageDrawAdjustment({
  sessionStatus,
  stage,
  matches,
  expected,
  desired,
}: PlanStageDrawAdjustmentInput): StageDrawAdjustmentPlan {
  if (sessionStatus !== 'draw_published' && sessionStatus !== 'in_progress') {
    throw new StageDrawUnavailableError('Only a published or in progress session can have a stage draw adjusted.');
  }

  // Unique row IDs also make route-update (matchId, outcome) keys unique: each
  // match row owns at most one winner route and one loser route.
  if (new Set(matches.map((match) => match.id)).size !== matches.length) {
    throw new StageDrawValidationError('The session match data contains duplicate match IDs.');
  }

  const stageMatches = matches.filter((match) => isSelectedStage(match, stage));
  if (stageMatches.length === 0) {
    throw new StageDrawUnavailableError('The selected stage does not exist in this session.');
  }
  if (stageMatches.some((match) => match.status !== 'pending')) {
    throw new StageDrawUnavailableError('This stage has already started and can no longer be adjusted.');
  }
  if (stageMatches.some((match) => !match.teamAId || !match.teamBId)) {
    throw new StageDrawUnavailableError('Every team in this stage must be resolved before its draw can be adjusted.');
  }

  assertExpectedCurrent(stageMatches, expected);
  const stageMatchIds = new Set(stageMatches.map((match) => match.id));
  assertDesiredMatchIds(desired, stageMatchIds);
  const desiredById = new Map(desired.map((snapshot) => [snapshot.matchId, snapshot]));

  return stage.matchKind === 'round_robin'
    ? planRoundRobin(stageMatches, desiredById)
    : planBracketLike(matches, stageMatches, desiredById);
}
