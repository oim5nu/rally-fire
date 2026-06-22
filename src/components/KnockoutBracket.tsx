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
        <span>Match {match.sequence}</span><span>{match.court ?? 'Court TBC'}</span>
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

export default function KnockoutBracket({
  teams,
  matches,
  renderMatch,
}: {
  teams: BracketTeam[];
  matches: BracketMatch[];
  renderMatch?: (match: BracketMatch, teamA?: BracketTeam, teamB?: BracketTeam) => ReactNode;
}) {
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const stages = groupKnockoutStages(matches);
  const final = stages.at(-1)?.matches[0];
  const championId = final?.status === 'completed'
    ? ((final.scoreA ?? 0) > (final.scoreB ?? 0) ? final.teamAId : final.teamBId)
    : null;
  const champion = championId ? teamMap.get(championId) : undefined;

  return (
    <section aria-label="Knockout bracket" className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-[#0d172c] p-4 [scrollbar-color:#59637a_transparent]">
      <div className="flex min-w-max items-stretch gap-6">
        {stages.map((stage) => (
          <section key={stage.round} className="flex w-72 flex-col" aria-labelledby={`knockout-stage-${stage.round}`}>
            <h3 id={`knockout-stage-${stage.round}`} className="mb-4 border-b border-primary-fixed/30 pb-2 text-xs font-black uppercase tracking-[0.18em] text-primary-fixed">
              {bracketStageLabel(stage.round, stage.matches.length)}
            </h3>
            <div className="flex flex-1 flex-col justify-around gap-6 py-2">
              {stage.matches.map((match) => {
                const teamA = match.teamAId ? teamMap.get(match.teamAId) : undefined;
                const teamB = match.teamBId ? teamMap.get(match.teamBId) : undefined;
                return <div key={match.id} className="relative after:absolute after:left-full after:top-1/2 after:h-px after:w-6 after:bg-outline-variant/35">{renderMatch?.(match, teamA, teamB) ?? <ReadonlyMatchCard match={match} teamA={teamA} teamB={teamB} />}</div>;
              })}
            </div>
          </section>
        ))}
        <section className="flex w-56 flex-col" aria-labelledby="knockout-champion">
          <h3 id="knockout-champion" className="mb-4 border-b border-primary-fixed/30 pb-2 text-xs font-black uppercase tracking-[0.18em] text-primary-fixed">Champion</h3>
          <div className="flex flex-1 items-center">
            <div className="w-full rounded-xl border border-primary-fixed/40 bg-primary-fixed/10 p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed">Winner</p>
              <p className="mt-2 text-sm font-black text-white">{teamName(champion)}</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
