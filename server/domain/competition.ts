import { randomInt } from 'node:crypto';

export interface SkillPlayer {
  id: string;
  name: string;
  skill: number;
}

export interface RankedPlayer extends SkillPlayer {
  rankingValue: number;
}

export interface GroupedPlayer extends SkillPlayer {
  group: 'A' | 'B';
}

export interface DrawTeam {
  number?: number;
  members: [GroupedPlayer, GroupedPlayer];
}

export interface DrawMatch {
  teamAIndex: number;
  teamBIndex: number;
  sequence: number;
}

export function planAttendanceRollback(
  status: string,
  matchStatuses: readonly string[],
) {
  if (!['draw_published', 'in_progress'].includes(status)) {
    throw new Error('Only a published or in progress session can return to attendance.');
  }
  return {
    matchCount: matchStatuses.length,
    scoredMatchCount: matchStatuses.filter((matchStatus) => matchStatus === 'completed').length,
  };
}

export interface ConfiguredPair {
  number: number;
  groupAPlayerId: string;
  groupBPlayerId: string;
}

export type KnockoutSource =
  | { kind: 'team'; teamIndex: number }
  | { kind: 'preliminary'; matchIndex: number };

export interface KnockoutConfig {
  preliminaryPairs: Array<[number, number]>;
  mainSources: KnockoutSource[];
}

export interface KnockoutMatchPlan {
  key: string;
  round: number;
  position: number;
  teamAIndex: number | null;
  teamBIndex: number | null;
  sourceAKey: string | null;
  sourceBKey: string | null;
  nextKey: string | null;
  winnerToSlot: 'A' | 'B' | null;
}

function bracketSeedOrder(size: number): number[] {
  let order = [1, 2];
  for (let currentSize = 2; currentSize < size; currentSize *= 2) {
    const nextSize = currentSize * 2;
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return size === 1 ? [1] : order;
}

export function buildDefaultKnockoutConfig(teamCount: number): KnockoutConfig {
  if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error('Knockout requires at least two teams.');
  const mainSize = 2 ** Math.floor(Math.log2(teamCount));
  const preliminaryCount = teamCount - mainSize;
  const byeCount = mainSize - preliminaryCount;
  const preliminaryPairs = Array.from({ length: preliminaryCount }, (_, index) => [
    byeCount + index,
    teamCount - 1 - index,
  ] as [number, number]);
  const nominalSources = Array.from({ length: mainSize }, (_, index): KnockoutSource =>
    index < byeCount
      ? { kind: 'team', teamIndex: index }
      : { kind: 'preliminary', matchIndex: index - byeCount });
  return {
    preliminaryPairs,
    mainSources: bracketSeedOrder(mainSize).map((seed) => nominalSources[seed - 1]),
  };
}

export function buildKnockoutDraw(teamCount: number, config: KnockoutConfig) {
  const mainSize = 2 ** Math.floor(Math.log2(teamCount));
  const preliminaryCount = teamCount - mainSize;
  if (config.preliminaryPairs.length !== preliminaryCount || config.mainSources.length !== mainSize) {
    throw new Error('Knockout configuration does not match the required bracket size.');
  }
  const teamUses = config.preliminaryPairs.flat();
  const preliminaryUses: number[] = [];
  for (const source of config.mainSources) {
    if (source.kind === 'team') teamUses.push(source.teamIndex);
    else preliminaryUses.push(source.matchIndex);
  }
  const expectedTeams = Array.from({ length: teamCount }, (_, index) => index);
  const sortedTeams = [...teamUses].sort((left, right) => left - right);
  const sortedPreliminaries = [...preliminaryUses].sort((left, right) => left - right);
  if (sortedTeams.join(',') !== expectedTeams.join(',')
    || sortedPreliminaries.join(',') !== Array.from({ length: preliminaryCount }, (_, index) => index).join(',')) {
    throw new Error('Every team and preliminary winner must be used exactly once.');
  }

  const matches: KnockoutMatchPlan[] = config.preliminaryPairs.map(([teamAIndex, teamBIndex], position) => ({
    key: `preliminary-${position}`,
    round: 0,
    position,
    teamAIndex,
    teamBIndex,
    sourceAKey: null,
    sourceBKey: null,
    nextKey: null,
    winnerToSlot: null,
  }));

  let sources = config.mainSources.map((source) => source.kind === 'team'
    ? { teamIndex: source.teamIndex, sourceKey: null as string | null }
    : { teamIndex: null, sourceKey: `preliminary-${source.matchIndex}` });
  let round = 1;
  while (sources.length > 1) {
    const roundMatches: KnockoutMatchPlan[] = [];
    for (let position = 0; position < sources.length / 2; position += 1) {
      const sourceA = sources[position * 2];
      const sourceB = sources[position * 2 + 1];
      roundMatches.push({
        key: `round-${round}-${position}`,
        round,
        position,
        teamAIndex: sourceA.teamIndex,
        teamBIndex: sourceB.teamIndex,
        sourceAKey: sourceA.sourceKey,
        sourceBKey: sourceB.sourceKey,
        nextKey: null,
        winnerToSlot: null,
      });
    }
    matches.push(...roundMatches);
    sources = roundMatches.map((match) => ({ teamIndex: null, sourceKey: match.key }));
    round += 1;
  }

  const downstream = new Map<string, { nextKey: string; slot: 'A' | 'B' }>();
  for (const match of matches) {
    if (match.sourceAKey) downstream.set(match.sourceAKey, { nextKey: match.key, slot: 'A' });
    if (match.sourceBKey) downstream.set(match.sourceBKey, { nextKey: match.key, slot: 'B' });
  }
  return {
    matches: matches.map((match) => ({
      ...match,
      nextKey: downstream.get(match.key)?.nextKey ?? null,
      winnerToSlot: downstream.get(match.key)?.slot ?? null,
    })),
  };
}

export function knockoutStageLabel(round: number, matchCount: number): string {
  if (round === 0) return 'Preliminary';
  if (matchCount === 1) return 'Final';
  if (matchCount === 2) return 'Semifinal';
  if (matchCount === 4) return 'Quarterfinal';
  return `Round of ${matchCount * 2}`;
}

export function validateWinnerAdvancement(
  currentWinnerTeamId: string | null,
  nextWinnerTeamId: string,
  downstreamScored: boolean,
): void {
  if (downstreamScored && currentWinnerTeamId !== nextWinnerTeamId) {
    throw new Error('The downstream match is already scored. Return to attendance before changing this winner.');
  }
}

function buildMatches(teamCount: number): DrawMatch[] {
  const matches: DrawMatch[] = [];
  for (let teamAIndex = 0; teamAIndex < teamCount; teamAIndex += 1) {
    for (let teamBIndex = teamAIndex + 1; teamBIndex < teamCount; teamBIndex += 1) {
      matches.push({ teamAIndex, teamBIndex, sequence: matches.length + 1 });
    }
  }
  return matches;
}

export function buildConfiguredDraw(participants: GroupedPlayer[], pairs: ConfiguredPair[]) {
  if (pairs.length < 2 || pairs.length * 2 !== participants.length) {
    throw new Error('Every attendee must be assigned to one of at least two pairs.');
  }
  if (new Set(pairs.map((pair) => pair.number)).size !== pairs.length
    || pairs.some((pair) => !Number.isInteger(pair.number) || pair.number < 1)) {
    throw new Error('Pair numbers must be unique positive integers.');
  }

  const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
  const usedPlayerIds = new Set<string>();
  const teams = [...pairs]
    .sort((left, right) => left.number - right.number)
    .map((pair) => {
      const groupA = participantsById.get(pair.groupAPlayerId);
      const groupB = participantsById.get(pair.groupBPlayerId);
      if (groupA?.group !== 'A' || groupB?.group !== 'B') {
        throw new Error('Each pair must contain one saved Group A and one saved Group B attendee.');
      }
      if (usedPlayerIds.has(groupA.id) || usedPlayerIds.has(groupB.id)) {
        throw new Error('Each attendee can appear in only one pair.');
      }
      usedPlayerIds.add(groupA.id);
      usedPlayerIds.add(groupB.id);
      return { number: pair.number, members: [groupA, groupB] as [GroupedPlayer, GroupedPlayer] };
    });

  if (usedPlayerIds.size !== participants.length) {
    throw new Error('Every attendee must be assigned to a pair.');
  }
  return { teams, matches: buildMatches(teams.length) };
}

export function buildDrawPersistenceRows(
  sessionId: string,
  participants: GroupedPlayer[],
  draw: { teams: DrawTeam[]; matches: DrawMatch[] },
) {
  return {
    participants: participants.map((participant) => ({
      sessionId,
      playerId: participant.id,
      status: 'attendee' as const,
      group: participant.group,
    })),
    teams: draw.teams.map((team, index) => ({ sessionId, seed: team.number ?? index + 1 })),
    members: draw.teams.flatMap((team, teamIndex) => team.members.map((member) => ({
      teamIndex,
      sessionId,
      playerId: member.id,
      group: member.group,
    }))),
    matches: draw.matches,
  };
}

export function assignRankedGroups(players: RankedPlayer[]): GroupedPlayer[] {
  const sorted = [...players].sort(
    (left, right) =>
      right.rankingValue - left.rankingValue
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id),
  );
  const groupASize = Math.ceil(sorted.length / 2);

  return sorted.map((player, index) => ({
    ...player,
    group: index < groupASize ? 'A' : 'B',
  }));
}

function shuffle<T>(items: T[], chooseIndex: (maxExclusive: number) => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = chooseIndex(index + 1);
    if (!Number.isInteger(selected) || selected < 0 || selected > index) {
      throw new Error('Random index generator returned an invalid index.');
    }
    [shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]];
  }
  return shuffled;
}

export function buildRoundRobinDraw(
  participants: GroupedPlayer[],
  chooseIndex: (maxExclusive: number) => number = randomInt,
): { teams: DrawTeam[]; matches: DrawMatch[] } {
  const groupA = participants.filter((participant) => participant.group === 'A');
  const groupB = participants.filter((participant) => participant.group === 'B');

  if (groupA.length !== groupB.length) {
    throw new Error('Groups A and B must contain an equal number of players.');
  }
  if (groupA.length < 2) {
    throw new Error('At least two teams are required to generate a draw.');
  }

  const shuffledA = shuffle(groupA, chooseIndex);
  const shuffledB = shuffle(groupB, chooseIndex);
  const teams = shuffledA.map((playerA, index) => ({
    members: [playerA, shuffledB[index]] as [GroupedPlayer, GroupedPlayer],
  }));
  return { teams, matches: buildMatches(teams.length) };
}

export function validateCompletedScore(scoreA: number, scoreB: number) {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    throw new Error('Scores must be integers.');
  }
  if (scoreA < 0 || scoreA > 99 || scoreB < 0 || scoreB > 99) {
    throw new Error('Scores must be between 0 and 99.');
  }
  if (scoreA === scoreB) {
    throw new Error('A completed match cannot end in a tie.');
  }
  return { scoreA, scoreB };
}

interface MatchAwardInput {
  matchId: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  scoreA: number;
  scoreB: number;
  winPoints: number;
  lossPoints: number;
}

export interface MatchAward {
  playerId: string;
  points: number;
  reason: 'match_win' | 'match_loss';
  matchId: string;
}

export function calculateMatchAwards(input: MatchAwardInput): MatchAward[] {
  validateCompletedScore(input.scoreA, input.scoreB);
  const teamAWon = input.scoreA > input.scoreB;
  const winners = teamAWon ? input.teamAPlayerIds : input.teamBPlayerIds;
  const losers = teamAWon ? input.teamBPlayerIds : input.teamAPlayerIds;

  return [
    ...winners.map((playerId) => ({
      playerId,
      points: input.winPoints,
      reason: 'match_win' as const,
      matchId: input.matchId,
    })),
    ...losers.map((playerId) => ({
      playerId,
      points: input.lossPoints,
      reason: 'match_loss' as const,
      matchId: input.matchId,
    })),
  ];
}
