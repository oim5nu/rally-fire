import { randomInt } from 'node:crypto';

export interface SkillPlayer {
  id: string;
  name: string;
  skill: number;
}

export interface GroupedPlayer extends SkillPlayer {
  group: 'A' | 'B';
}

export interface DrawTeam {
  members: [GroupedPlayer, GroupedPlayer];
}

export interface DrawMatch {
  teamAIndex: number;
  teamBIndex: number;
  sequence: number;
}

export function assignSkillGroups(players: SkillPlayer[]): GroupedPlayer[] {
  const sorted = [...players].sort(
    (left, right) => right.skill - left.skill || left.name.localeCompare(right.name),
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
  const matches: DrawMatch[] = [];

  for (let teamAIndex = 0; teamAIndex < teams.length; teamAIndex += 1) {
    for (let teamBIndex = teamAIndex + 1; teamBIndex < teams.length; teamBIndex += 1) {
      matches.push({
        teamAIndex,
        teamBIndex,
        sequence: matches.length + 1,
      });
    }
  }

  return { teams, matches };
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
