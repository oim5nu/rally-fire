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
