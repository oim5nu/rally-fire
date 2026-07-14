import type { ReactNode } from 'react';

export interface BracketTeam {
  id: string;
  seed: number;
  members: Array<{ name: string }>;
}

export interface BracketMatch {
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
}

export function bracketStageLabel(round: number, matchCount: number): string {
  if (round === 0) return 'Preliminary';
  if (matchCount === 1) return 'Final';
  if (matchCount === 2) return 'Semifinal';
  if (matchCount === 4) return 'Quarterfinal';
  return `Round of ${matchCount * 2}`;
}

export function groupKnockoutStages<T extends { bracketRound: number | null; bracketPosition: number | null }>(matches: T[]) {
  const rounds = new Map<number, T[]>();
  for (const match of matches) {
    if (match.bracketRound === null) continue;
    const roundMatches = rounds.get(match.bracketRound) ?? [];
    roundMatches.push(match);
    rounds.set(match.bracketRound, roundMatches);
  }
  return [...rounds.entries()]
    .sort(([left], [right]) => left - right)
    .map(([round, roundMatches]) => ({
      round,
      matches: roundMatches.sort((left, right) => (left.bracketPosition ?? 0) - (right.bracketPosition ?? 0)),
    }));
}

export function groupTournamentBrackets<T extends {
  matchKind?: string;
  placementGroup?: number | null;
  placementBestRank?: number | null;
  placementWorstRank?: number | null;
}>(matches: T[]) {
  const championship = matches.filter((match) => match.matchKind !== 'placement');
  const groups = new Map<number, T[]>();
  for (const match of matches) {
    if (match.matchKind !== 'placement' || match.placementGroup === null || match.placementGroup === undefined) continue;
    groups.set(match.placementGroup, [...(groups.get(match.placementGroup) ?? []), match]);
  }
  return {
    championship,
    placements: [...groups.entries()]
      .sort(([left], [right]) => left - right)
      .map(([id, groupMatches]) => ({
        id,
        bestRank: groupMatches[0]?.placementBestRank ?? null,
        worstRank: Math.max(...groupMatches.map((match) => match.placementWorstRank ?? 0)),
        matches: groupMatches,
      })),
  };
}

function ordinal(rank: number) {
  const remainder = rank % 100;
  if (remainder >= 11 && remainder <= 13) return `${rank}th`;
  if (rank % 10 === 1) return `${rank}st`;
  if (rank % 10 === 2) return `${rank}nd`;
  if (rank % 10 === 3) return `${rank}rd`;
  return `${rank}th`;
}

export function placementGroupLabel(bestRank: number, worstRank: number) {
  return worstRank === bestRank + 1
    ? `${ordinal(bestRank)} / ${ordinal(worstRank)} place`
    : `${ordinal(bestRank)}–${ordinal(worstRank)} place`;
}

function teamName(team: BracketTeam | undefined) {
  return team ? `#${team.seed} ${team.members.map((member) => member.name).join(' / ')}` : 'TBD';
}

function ReadonlyMatchCard({ match, teamA, teamB }: {
  match: BracketMatch;
  teamA?: BracketTeam;
  teamB?: BracketTeam;
}) {
  const teamAWon = match.status === 'completed' && (match.scoreA ?? 0) > (match.scoreB ?? 0);
  const teamBWon = match.status === 'completed' && (match.scoreB ?? 0) > (match.scoreA ?? 0);
  return (
    <article className="w-72 rounded-xl border border-outline-variant/25 bg-surface-dim/90 p-3 shadow-lg">
      <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        <span>{match.matchKind === 'placement' && match.placementWorstRank === (match.placementBestRank ?? 0) + 1
          ? placementGroupLabel(match.placementBestRank!, match.placementWorstRank!)
          : `Match ${match.sequence}`}</span><span>{match.court ?? 'Court TBC'}</span>
      </div>
      <div className={`flex items-center justify-between gap-3 rounded px-2 py-1.5 ${teamAWon ? 'bg-primary-fixed/10 text-primary-fixed' : 'text-white'}`}>
        <span className="truncate text-xs font-bold">{teamName(teamA)}</span><span className="font-stats font-black">{match.scoreA ?? '-'}</span>
      </div>
      <div className={`mt-1 flex items-center justify-between gap-3 rounded px-2 py-1.5 ${teamBWon ? 'bg-primary-fixed/10 text-primary-fixed' : 'text-white'}`}>
        <span className="truncate text-xs font-bold">{teamName(teamB)}</span><span className="font-stats font-black">{match.scoreB ?? '-'}</span>
      </div>
    </article>
  );
}

function BracketSection({
  teams,
  matches,
  title,
  showChampion,
  renderMatch,
}: {
  teams: BracketTeam[];
  matches: BracketMatch[];
  title: string;
  showChampion: boolean;
  renderMatch?: (match: BracketMatch, teamA?: BracketTeam, teamB?: BracketTeam) => ReactNode;
}) {
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const stages = groupKnockoutStages(matches);
  const final = stages.at(-1)?.matches[0];
  const championId = showChampion && final?.status === 'completed'
    ? ((final.scoreA ?? 0) > (final.scoreB ?? 0) ? final.teamAId : final.teamBId)
    : null;
  const champion = championId ? teamMap.get(championId) : undefined;

  return (
    <section aria-label={title} className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-[#0d172c] p-4 [scrollbar-color:#59637a_transparent]">
      <div className="mb-4 flex items-center gap-3 border-b border-primary-fixed/20 pb-3">
        <span className={`h-2.5 w-2.5 rounded-full ${showChampion ? 'bg-primary-fixed' : 'bg-tertiary-fixed'}`} aria-hidden="true" />
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">{title}</h3>
      </div>
      <div className="flex min-w-max items-stretch gap-6">
        {stages.map((stage) => (
          <section key={stage.round} className="flex w-72 flex-col" aria-labelledby={`${title.replace(/\W+/g, '-').toLowerCase()}-${stage.round}`}>
            <h4 id={`${title.replace(/\W+/g, '-').toLowerCase()}-${stage.round}`} className="mb-4 border-b border-primary-fixed/30 pb-2 text-xs font-black uppercase tracking-[0.18em] text-primary-fixed">
              {showChampion ? bracketStageLabel(stage.round, stage.matches.length) : `Placement round ${stage.round + 1}`}
            </h4>
            <div className="flex flex-1 flex-col justify-around gap-6 py-2">
              {stage.matches.map((match) => {
                const teamA = match.teamAId ? teamMap.get(match.teamAId) : undefined;
                const teamB = match.teamBId ? teamMap.get(match.teamBId) : undefined;
                return <div key={match.id} className="relative after:absolute after:left-full after:top-1/2 after:h-px after:w-6 after:bg-outline-variant/35">{renderMatch?.(match, teamA, teamB) ?? <ReadonlyMatchCard match={match} teamA={teamA} teamB={teamB} />}</div>;
              })}
            </div>
          </section>
        ))}
        {showChampion && (
          <section className="flex w-56 flex-col" aria-labelledby="knockout-champion">
            <h4 id="knockout-champion" className="mb-4 border-b border-primary-fixed/30 pb-2 text-xs font-black uppercase tracking-[0.18em] text-primary-fixed">Champion</h4>
            <div className="flex flex-1 items-center">
              <div className="w-full rounded-xl border border-primary-fixed/40 bg-primary-fixed/10 p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed">Winner</p>
                <p className="mt-2 text-sm font-black text-white">{teamName(champion)}</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

export default function KnockoutBracket({
  teams,
  matches,
  renderMatch,
}: {
  teams: BracketTeam[];
  matches: BracketMatch[];
  renderMatch?: (match: BracketMatch, teamA?: BracketTeam, teamB?: BracketTeam) => ReactNode;
}) {
  const tournament = groupTournamentBrackets(matches);

  return (
    <div className="space-y-4">
      <BracketSection teams={teams} matches={tournament.championship} title="Championship bracket" showChampion renderMatch={renderMatch} />
      {tournament.placements.map((group) => (
        <BracketSection
          key={group.id}
          teams={teams}
          matches={group.matches}
          title={placementGroupLabel(group.bestRank ?? 1, group.worstRank)}
          showChampion={false}
          renderMatch={renderMatch}
        />
      ))}
    </div>
  );
}
