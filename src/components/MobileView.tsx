import React, { useState } from 'react';
import type { MatchPair, Player } from '../types';
import KnockoutBracket from './KnockoutBracket';
import type { BracketMatch, BracketTeam } from './KnockoutBracket';

interface MobileViewProps {
  players: Player[];
  matches: MatchPair[];
  activeSession: null | { format: 'round_robin' | 'knockout'; teams: BracketTeam[]; matches: BracketMatch[] };
  lang: 'en' | 'zh';
  setLang: (lang: 'en' | 'zh') => void;
}

export default function MobileView({ players, matches, activeSession, lang, setLang }: MobileViewProps) {
  const [view, setView] = useState<'matches' | 'leaderboard'>('matches');
  const sortedPlayers = [...players].sort((left, right) => right.points - left.points);

  return (
    <section className={`mx-auto min-h-[640px] w-full overflow-hidden rounded-[2rem] border border-outline-variant/30 bg-surface-container shadow-2xl ${activeSession?.format === 'knockout' ? 'max-w-7xl' : 'max-w-md'}`}>
      <header className="border-b border-outline-variant/20 bg-surface-container-high px-5 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-fixed">Live court feed</p><h1 className="mt-1 font-display text-2xl font-black text-white">RallyFire</h1></div>
          <button type="button" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface-variant">{lang === 'en' ? '中文' : 'EN'}</button>
        </div>
        <div className="mt-5 grid grid-cols-2 rounded-xl bg-surface-dim p-1" role="tablist" aria-label="Public competition data">
          <button type="button" role="tab" aria-selected={view === 'matches'} onClick={() => setView('matches')} className={`rounded-lg px-3 py-2 text-xs font-bold ${view === 'matches' ? 'bg-primary-fixed text-on-primary-fixed' : 'text-on-surface-variant'}`}>{lang === 'en' ? 'Matches' : '比赛'}</button>
          <button type="button" role="tab" aria-selected={view === 'leaderboard'} onClick={() => setView('leaderboard')} className={`rounded-lg px-3 py-2 text-xs font-bold ${view === 'leaderboard' ? 'bg-primary-fixed text-on-primary-fixed' : 'text-on-surface-variant'}`}>{lang === 'en' ? 'Leaderboard' : '排行榜'}</button>
        </div>
      </header>

      <div className="space-y-3 p-5">
        {view === 'matches' ? (
          activeSession?.format === 'knockout' ? <KnockoutBracket teams={activeSession.teams} matches={activeSession.matches} /> : matches.length ? matches.map((match, index) => (
            <article key={match.id} className="rounded-2xl border border-outline-variant/20 bg-surface-dim/60 p-4">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant"><span>Match {index + 1}</span><span>{match.court ?? 'Court TBC'} · {match.status}</span></div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <p className="text-sm font-black leading-tight text-white">{match.playerA.name}</p>
                <div className="rounded-lg bg-surface-container px-3 py-2 font-stats text-xl font-black text-primary-fixed">{match.scoreA ?? '-'} : {match.scoreB ?? '-'}</div>
                <p className="text-right text-sm font-black leading-tight text-white">{match.playerB.name}</p>
              </div>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-outline-variant/40 p-10 text-center"><p className="text-sm font-bold text-white">No published draw</p><p className="mt-2 text-xs text-on-surface-variant">The next draw and saved scores will appear here automatically.</p></div>
        ) : (
          sortedPlayers.length ? sortedPlayers.map((player, index) => (
            <div key={player.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl bg-surface-dim/60 px-3 py-3">
              <span className={`font-stats text-lg font-black ${index < 3 ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>{index + 1}</span>
              <div><p className="text-sm font-bold text-white">{player.name}</p><p className="text-[10px] text-on-surface-variant">{player.rating}</p></div>
              <span className="font-stats text-lg font-black text-white">{player.points}</span>
            </div>
          )) : <div className="rounded-2xl border border-dashed border-outline-variant/40 p-10 text-center text-sm text-on-surface-variant">The leaderboard starts empty.</div>
        )}
      </div>
    </section>
  );
}
