import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import AdminDashboard from './components/AdminDashboard';
import AuthPage from './components/AuthPage';
import LandingPage from './components/LandingPage';
import MobileView from './components/MobileView';
import { adminRequest, publicFetcher } from './lib/api';
import { useActivity } from './lib/activity';
import { getSupabaseBrowserClient } from './lib/supabase';
import type { MatchPair, Player, ScreenMode } from './types';

interface PublicState {
  season: { id: string; name: string } | null;
  leaderboard: Array<{ id: string; name: string; displayRating: string; points: number }>;
  activeSession: null | {
    id: string;
    name: string;
    format: 'round_robin' | 'knockout' | 'qualifying_knockout';
    teams: Array<{ id: string; seed: number; members: Array<{ playerId: string; name: string }> }>;
    matches: Array<{
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
      matchKind: 'round_robin' | 'qualifier' | 'championship' | 'placement';
      placementGroup: number | null;
      placementBestRank: number | null;
      placementWorstRank: number | null;
    }>;
  };
}

interface Membership {
  id: string;
  email: string;
  role: 'admin' | 'superadmin';
  status: 'active' | 'disabled';
}

function ratingValue(rating: string) {
  return Number(rating.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
}

function teamAsPlayer(team: { id: string; members: Array<{ name: string }> }): Player {
  return {
    id: team.id,
    name: team.members.map((member) => member.name).join(' / '),
    rating: 'Doubles team',
    ratingValue: 0,
    points: 0,
    winRate: '-',
    group: 'A',
    winStreak: 0,
  };
}

export default function App() {
  const { begin, reportError, track } = useActivity();
  const [screenMode, setScreenMode] = useState<ScreenMode>(
    new URLSearchParams(window.location.search).has('setup') ? 'auth' : 'landing',
  );
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [authNotice, setAuthNotice] = useState('');
  const { data, error: publicError, isLoading, isValidating, mutate: mutatePublic } = useSWR<PublicState>(
    '/api/public/state',
    publicFetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true },
  );

  useEffect(() => {
    if (!isLoading && !isValidating) return;
    return begin();
  }, [begin, isLoading, isValidating]);

  useEffect(() => {
    if (publicError) reportError(publicError instanceof Error ? publicError.message : 'Live competition data is temporarily unavailable.');
  }, [publicError, reportError]);

  const players = useMemo<Player[]>(() => {
    const leaderboard = data?.leaderboard ?? [];
    const groupASize = Math.ceil(leaderboard.length / 2);
    return leaderboard.map((player, index) => ({
      id: player.id,
      name: player.name,
      rating: player.displayRating,
      ratingValue: ratingValue(player.displayRating),
      points: player.points,
      winRate: '-',
      initials: player.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      group: index < groupASize ? 'A' : 'B',
      winStreak: 0,
    }));
  }, [data?.leaderboard]);

  const matches = useMemo<MatchPair[]>(() => {
    const activeSession = data?.activeSession;
    if (!activeSession) return [];
    const teamMap = new Map(activeSession.teams.map((team) => [team.id, team]));
    return activeSession.matches.flatMap((match) => {
      const teamA = teamMap.get(match.teamAId);
      const teamB = teamMap.get(match.teamBId);
      if (!teamA || !teamB) return [];
      return [{
        id: match.id,
        playerA: teamAsPlayer(teamA),
        playerB: teamAsPlayer(teamB),
        scoreA: match.scoreA ?? undefined,
        scoreB: match.scoreB ?? undefined,
        court: match.court ?? undefined,
        status: match.status === 'completed' ? 'Completed' : match.status === 'in_progress' ? 'In Progress' : 'Pending',
      } satisfies MatchPair];
    });
  }, [data?.activeSession]);

  const loadAdmin = useCallback(async () => {
    await track(async () => {
      const result = await adminRequest<{ membership: Membership }>('/api/admin/me');
      setMembership(result.membership);
      setAuthNotice('');
      setScreenMode('admin');
    });
  }, [track]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session && !new URLSearchParams(window.location.search).has('setup')) {
        void loadAdmin().catch((caught) => reportError(caught instanceof Error ? caught.message : 'Administrator access could not be loaded.'));
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setMembership(null);
      }
    });
    const handleReauth = () => {
      setMembership(null);
      setAuthNotice('Your eight-hour administrator session ended. Sign in again to continue.');
      setScreenMode('auth');
    };
    window.addEventListener('rallyfire:reauth', handleReauth);
    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener('rallyfire:reauth', handleReauth);
    };
  }, [loadAdmin, reportError]);

  async function handleLogout() {
    try {
      await track(async () => {
        await getSupabaseBrowserClient().auth.signOut({ scope: 'local' });
        setMembership(null);
        setScreenMode('landing');
      });
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : 'Logout failed.');
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1326] font-sans text-[#dae2fd] selection:bg-primary-container selection:text-on-primary-container">
      <header className="sticky top-0 z-20 border-b border-surface-bright bg-[#171f33]/95 shadow-md backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <button type="button" onClick={() => setScreenMode('landing')} className="flex items-center gap-2 hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fixed">
            <span className="material-symbols-outlined text-3xl font-black text-primary-container">sports_tennis</span>
            <span className="font-display text-xl font-black italic tracking-tighter text-primary-container">RALLYFIRE</span>
          </button>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
            <button type="button" onClick={() => setScreenMode('landing')} className="text-xs font-semibold text-[#c4c9ac] hover:text-[#c3f400]">Leaderboard</button>
            <button type="button" onClick={() => setScreenMode('player_mobile')} className="text-xs font-semibold text-[#c4c9ac] hover:text-[#c3f400]">Matches</button>
          </nav>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded border border-outline-variant/30 bg-surface-container-high px-2 py-1 text-xs">
              <button type="button" onClick={() => setLang('en')} className={lang === 'en' ? 'rounded bg-[#c3f400] px-1.5 py-0.5 font-semibold text-black' : 'px-1.5 text-on-surface-variant'}>EN</button>
              <button type="button" onClick={() => setLang('zh')} className={lang === 'zh' ? 'rounded bg-[#c3f400] px-1.5 py-0.5 font-semibold text-black' : 'px-1.5 text-on-surface-variant'}>中文</button>
            </div>
            {membership ? (
              <><button type="button" onClick={() => setScreenMode('admin')} className="hidden text-xs font-semibold text-on-surface-variant hover:text-primary-fixed sm:block">Admin console</button><button type="button" onClick={handleLogout} className="rounded border border-outline-variant px-3 py-2 text-xs font-semibold text-white">Logout</button></>
            ) : (
              <button type="button" onClick={() => setScreenMode('auth')} className="rounded bg-[#c3f400] px-4 py-2 text-xs font-extrabold text-black hover:bg-[#abd600]">Admin login</button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-grow p-4 md:p-8">
        {authNotice && screenMode === 'auth' && <div role="alert" className="mx-auto mb-4 max-w-4xl rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-100">{authNotice}</div>}
        {screenMode === 'landing' && <LandingPage players={players} onNavigate={setScreenMode} lang={lang} setLang={setLang} seasonName={data?.season?.name} />}
        {screenMode === 'auth' && <AuthPage onSuccess={async () => loadAdmin()} onNavigate={setScreenMode} />}
        {screenMode === 'admin' && (membership ? <AdminDashboard membership={membership} onDataChanged={() => { void mutatePublic(); }} /> : <AuthPage onSuccess={async () => loadAdmin()} onNavigate={setScreenMode} />)}
        {screenMode === 'player_mobile' && <MobileView players={players} matches={matches} activeSession={data?.activeSession ?? null} lang={lang} setLang={setLang} />}
      </main>

      <footer className="mt-12 border-t border-outline-variant/20 bg-surface-container-lowest py-7">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-4 text-center text-xs text-on-surface-variant md:flex-row md:px-8 md:text-left">
          <span className="font-display font-black italic tracking-tight text-primary-container">RALLYFIRE</span>
          <span>&copy; {new Date().getFullYear()} RallyFire Tennis. Public scores refresh every ten seconds.</span>
        </div>
      </footer>
    </div>
  );
}
