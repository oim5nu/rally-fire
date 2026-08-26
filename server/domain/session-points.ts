import { validateCompletedScore } from './competition.js';

export type SessionFormat = 'round_robin' | 'knockout' | 'qualifying_knockout';

export type SessionMatchKind =
  | 'round_robin'
  | 'qualifier'
  | 'championship'
  | 'placement'
  | 'consolation';

export interface SessionMatchRecord {
  id: string;
  sequence: number;
  matchKind: SessionMatchKind;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  nextMatchId: string | null;
  placementGroup: number | null;
  placementBestRank: number | null;
  placementWorstRank: number | null;
}

export interface SessionTeam {
  id: string;
  seed: number;
  playerIds: readonly string[];
}

export interface SessionPointRules {
  winPoints: number;
  lossPoints: number;
  firstPlaceBonus: number;
  secondPlaceBonus: number;
  thirdPlaceBonus: number;
  maxSessionPoints: number;
}

export type SessionPointAwardType =
  | 'match_win'
  | 'match_loss'
  | 'placement_bonus'
  | 'session_cap_adjustment';

export interface SessionPlayerPointAward {
  playerId: string;
  teamId: string;
  type: SessionPointAwardType;
  points: number;
  matchId: string | null;
}

export interface SessionTeamPointSummary {
  teamId: string;
  placement: number | null;
  rawPoints: number;
  cappedPoints: number;
  capAdjustment: number;
}

export interface SessionPointPlan {
  teamSummaries: SessionTeamPointSummary[];
  playerAwards: SessionPlayerPointAward[];
}

export interface PlanSessionPointsInput {
  format: SessionFormat;
  matches: readonly SessionMatchRecord[];
  teams: readonly SessionTeam[];
  rules: SessionPointRules;
}

interface TeamStanding {
  team: SessionTeam;
  wins: number;
  pointDifferential: number;
  pointsScored: number;
  placement: number | null;
}

interface TeamAward {
  type: SessionPointAwardType;
  points: number;
  matchId: string | null;
}

const MAX_LEDGER_POINT_TENTHS = 999_999_999_999;

function assertRules(rules: SessionPointRules): void {
  const nonnegativeRules: (keyof Omit<SessionPointRules, 'maxSessionPoints'>)[] = [
    'winPoints',
    'lossPoints',
    'firstPlaceBonus',
    'secondPlaceBonus',
    'thirdPlaceBonus',
  ];
  for (const name of nonnegativeRules) {
    if (!Number.isFinite(rules[name]) || rules[name] < 0) {
      throw new Error(`${name} must be a nonnegative number.`);
    }
    if (!Number.isInteger(rules[name] * 10)) {
      throw new Error(`${name} must have at most one decimal place.`);
    }
  }
  if (!Number.isFinite(rules.maxSessionPoints) || rules.maxSessionPoints <= 0) {
    throw new Error('maxSessionPoints must be greater than zero.');
  }
  if (!Number.isInteger(rules.maxSessionPoints * 10)) {
    throw new Error('maxSessionPoints must have at most one decimal place.');
  }
}

function assertTeams(teams: readonly SessionTeam[]): void {
  const teamIds = new Set<string>();
  const playerIds = new Set<string>();
  for (const team of teams) {
    if (teamIds.has(team.id)) {
      throw new Error(`Duplicate team ID ${team.id} is not allowed.`);
    }
    teamIds.add(team.id);
    for (const playerId of team.playerIds) {
      if (playerIds.has(playerId)) {
        throw new Error(`Duplicate player ID ${playerId} is not allowed.`);
      }
      playerIds.add(playerId);
    }
  }
}

function assertMatches(
  matches: readonly SessionMatchRecord[],
  teamsById: ReadonlyMap<string, SessionTeam>,
): asserts matches is readonly (SessionMatchRecord & {
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
})[] {
  for (const match of matches) {
    if (!match.teamAId || !match.teamBId
      || !teamsById.has(match.teamAId) || !teamsById.has(match.teamBId)) {
      throw new Error(`Match ${match.id} must have two resolved session teams.`);
    }
    if (match.teamAId === match.teamBId) {
      throw new Error(`Match ${match.id} cannot contain the same team twice.`);
    }
    if (match.scoreA === null || match.scoreB === null) {
      throw new Error(`Match ${match.id} must have a complete score.`);
    }
    validateCompletedScore(match.scoreA, match.scoreB);
  }
}

function toTenths(points: number): number {
  return Math.round(points * 10);
}

function placementBonus(placement: number, rules: SessionPointRules): number {
  if (placement === 1) return rules.firstPlaceBonus;
  if (placement === 2) return rules.secondPlaceBonus;
  return rules.thirdPlaceBonus;
}

function terminalMatch(
  matches: readonly SessionMatchRecord[],
  predicate: (match: SessionMatchRecord) => boolean,
): SessionMatchRecord | undefined {
  return matches
    .filter((match) => predicate(match) && match.nextMatchId === null)
    .sort((left, right) => right.sequence - left.sequence)[0];
}

export function planSessionPoints({
  format,
  matches,
  teams,
  rules,
}: PlanSessionPointsInput): SessionPointPlan {
  assertRules(rules);
  assertTeams(teams);
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  assertMatches(matches, teamsById);

  const standingsByTeam = new Map(teams.map((team) => [team.id, {
    team,
    wins: 0,
    pointDifferential: 0,
    pointsScored: 0,
    placement: null,
  } satisfies TeamStanding]));
  const awardsByTeam = new Map(teams.map((team) => [team.id, [] as TeamAward[]]));

  for (const match of [...matches].sort((left, right) => left.sequence - right.sequence)) {
    const teamA = standingsByTeam.get(match.teamAId)!;
    const teamB = standingsByTeam.get(match.teamBId)!;
    teamA.pointsScored += match.scoreA;
    teamB.pointsScored += match.scoreB;
    teamA.pointDifferential += match.scoreA - match.scoreB;
    teamB.pointDifferential += match.scoreB - match.scoreA;

    const winner = match.scoreA > match.scoreB ? teamA : teamB;
    const loser = winner === teamA ? teamB : teamA;
    winner.wins += 1;
    awardsByTeam.get(winner.team.id)!.push({
      type: 'match_win', points: rules.winPoints, matchId: match.id,
    });
    awardsByTeam.get(loser.team.id)!.push({
      type: 'match_loss', points: rules.lossPoints, matchId: match.id,
    });
  }

  if (format === 'round_robin') {
    const ranked = [...standingsByTeam.values()].sort((left, right) =>
      right.wins - left.wins
      || right.pointDifferential - left.pointDifferential
      || right.pointsScored - left.pointsScored
      || left.team.seed - right.team.seed
      || left.team.id.localeCompare(right.team.id));
    ranked.forEach((standing, index) => {
      standing.placement = index + 1;
    });
  } else {
    const championshipFinal = terminalMatch(matches, (match) => match.matchKind === 'championship');
    if (championshipFinal) {
      const winnerId = championshipFinal.scoreA! > championshipFinal.scoreB!
        ? championshipFinal.teamAId!
        : championshipFinal.teamBId!;
      const runnerUpId = winnerId === championshipFinal.teamAId
        ? championshipFinal.teamBId!
        : championshipFinal.teamAId!;
      standingsByTeam.get(winnerId)!.placement = 1;
      standingsByTeam.get(runnerUpId)!.placement = 2;
    }
    const thirdPlaceFinal = terminalMatch(
      matches,
      (match) => match.matchKind === 'placement'
        && match.placementBestRank === 3
        && match.placementWorstRank === 4,
    );
    if (thirdPlaceFinal) {
      const thirdId = thirdPlaceFinal.scoreA! > thirdPlaceFinal.scoreB!
        ? thirdPlaceFinal.teamAId!
        : thirdPlaceFinal.teamBId!;
      standingsByTeam.get(thirdId)!.placement = 3;
    }
  }

  for (const standing of standingsByTeam.values()) {
    if (standing.placement !== null && standing.placement <= 3) {
      awardsByTeam.get(standing.team.id)!.push({
        type: 'placement_bonus',
        points: placementBonus(standing.placement, rules),
        matchId: null,
      });
    }
  }

  const inputOrder = new Map(teams.map((team, index) => [team.id, index]));
  const orderedStandings = [...standingsByTeam.values()].sort((left, right) => {
    if (left.placement === null && right.placement === null) {
      return inputOrder.get(left.team.id)! - inputOrder.get(right.team.id)!;
    }
    if (left.placement === null) return 1;
    if (right.placement === null) return -1;
    return left.placement - right.placement;
  });

  const teamSummaries: SessionTeamPointSummary[] = [];
  const playerAwards: SessionPlayerPointAward[] = [];
  for (const standing of orderedStandings) {
    const teamAwards = awardsByTeam.get(standing.team.id)!;
    const rawTenths = teamAwards.reduce((sum, award) => sum + toTenths(award.points), 0);
    const cappedTenths = Math.min(rawTenths, toTenths(rules.maxSessionPoints));
    const adjustmentTenths = cappedTenths - rawTenths;
    const rawPoints = rawTenths / 10;
    const cappedPoints = cappedTenths / 10;
    const capAdjustment = adjustmentTenths / 10;
    if (adjustmentTenths < 0) {
      let remainingAdjustmentTenths = -adjustmentTenths;
      while (remainingAdjustmentTenths > 0) {
        const chunkTenths = Math.min(remainingAdjustmentTenths, MAX_LEDGER_POINT_TENTHS);
        teamAwards.push({
          type: 'session_cap_adjustment',
          points: -chunkTenths / 10,
          matchId: null,
        });
        remainingAdjustmentTenths -= chunkTenths;
      }
    }
    teamSummaries.push({
      teamId: standing.team.id,
      placement: standing.placement,
      rawPoints,
      cappedPoints,
      capAdjustment,
    });
    for (const playerId of standing.team.playerIds) {
      playerAwards.push(...teamAwards.map((award) => ({
        playerId,
        teamId: standing.team.id,
        ...award,
      })));
    }
  }

  return { teamSummaries, playerAwards };
}
