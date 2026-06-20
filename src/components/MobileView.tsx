import React, { useState } from 'react';
import { Player, MatchPair } from '../types';

interface MobileViewProps {
  players: Player[];
  matches: MatchPair[];
  lang: 'en' | 'zh';
  setLang: (lang: 'en' | 'zh') => void;
}

export default function MobileView({ players, matches, lang, setLang }: MobileViewProps) {
  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A');
  const [activeNav, setActiveNav] = useState<'matches' | 'feed' | 'score' | 'profile'>('matches');
  
  // Custom mobile-drawn pair state
  const [team1Score, setTeam1Score] = useState(4);
  const [team2Score, setTeam2Score] = useState(2);
  const [mobilePairs, setMobilePairs] = useState([
    {
      team1: 'Alex Chen + David Wang',
      team2: 'Sarah Lin + Emma Tang'
    }
  ]);

  const [drawSuccess, setDrawSuccess] = useState(false);

  const handleMobileDraw = () => {
    // Shuffles and draws a custom mobile team
    const playersA = players.filter(p => p.group === 'A');
    const playersB = players.filter(p => p.group === 'B');
    if (playersA.length >= 2 && playersB.length >= 2) {
      const p1 = playersA[Math.floor(Math.random() * playersA.length)].name;
      const p2 = playersB[Math.floor(Math.random() * playersB.length)].name;
      const q1 = playersA[Math.floor(Math.random() * playersA.length)].name;
      const q2 = playersB[Math.floor(Math.random() * playersB.length)].name;
      
      setMobilePairs([
        {
          team1: `${p1.split(' ')[0]} C. + ${p2.split(' ')[0]} W.`,
          team2: `${q1.split(' ')[0]} L. + ${q2.split(' ')[0]} T.`
        }
      ]);
      setDrawSuccess(true);
      setTimeout(() => setDrawSuccess(false), 2000);
    }
  };

  const groupPlayers = players.filter(p => p.group === activeTab);

  return (
    <div className="max-w-[420px] mx-auto bg-[#0b1326] rounded-[24px] border-4 border-surface-container-highest shadow-2xl relative overflow-hidden flex flex-col min-h-[780px] text-white">
      {/* Phone Notch/Header Ambient */}
      <div className="h-6 bg-surface-container-lowest w-full flex justify-center items-center">
        <div className="w-24 h-4 bg-black rounded-b-xl"></div>
      </div>

      {/* TopAppBar */}
      <header className="bg-surface-container/90 sticky top-0 w-full z-45 border-b border-secondary-container/30 flex justify-between items-center px-4 h-14">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-primary-fixed text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>sports_tennis</span>
          <span className="font-display text-base font-black text-primary-fixed tracking-tight italic">RALLYFIRE</span>
        </div>
        
        <button 
          onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          className="text-on-surface-variant font-display text-xs hover:text-primary-fixed font-bold bg-surface-bright/35 px-2 py-1 rounded"
        >
          {lang === 'en' ? 'EN' : '中文'}
        </button>
      </header>

      {/* Scrollable Container */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 space-y-6">
        
        {/* Header Title Section */}
        <section className="text-center">
          <h1 className="font-display text-2xl font-black text-white">
            {lang === 'en' ? 'Wednesday Doubles Night' : '周三双打之夜'}
          </h1>
          <p className="font-sans text-xs text-on-surface-variant mt-1">
            {lang === 'en' ? 'Wednesday Doubles Night Tournament' : '周三例行双打循环赛'}
          </p>
          
          <div className="mt-3 flex justify-center gap-1.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary-container/10 text-primary-fixed font-display text-[10px] font-bold border border-primary-fixed/20">
              Round Robin
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-secondary-container/30 text-secondary font-display text-[10px] font-bold border border-secondary/20">
              16 Players Registered
            </span>
          </div>
        </section>

        {activeNav === 'matches' && (
          <>
            {/* Section 1: Player Grouping */}
            <section className="bg-surface-container p-4 rounded-xl shadow-lg border border-outline-variant/10">
              <h2 className="font-display text-sm font-bold text-white mb-3 flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
                <span className="material-symbols-outlined text-primary-fixed text-base">groups</span>
                Player Grouping
              </h2>
              
              <div className="flex gap-2 mb-3 bg-surface-dim p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('A')}
                  className={`flex-1 py-1.5 text-center text-xs font-display font-semibold rounded-md transition-all ${activeTab === 'A' ? 'bg-[#c3f400] text-black' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  Zone A (High)
                </button>
                <button 
                  onClick={() => setActiveTab('B')}
                  className={`flex-1 py-1.5 text-center text-xs font-display font-semibold rounded-md transition-all ${activeTab === 'B' ? 'bg-[#c3f400] text-black' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  Zone B (Standard)
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 select-none">
                {groupPlayers.slice(0, 4).map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between bg-surface-container-high p-2.5 rounded-lg border border-secondary-container/20">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold font-stats text-[10px]">
                        {idx + 1}
                      </div>
                      <span className="font-sans text-xs text-on-surface truncate w-32">{p.name}</span>
                    </div>
                    <span className="font-stats text-[11px] text-primary-fixed">
                      {p.rating}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Match Draw */}
            <section className="bg-surface-container p-4 rounded-xl shadow-lg border border-outline-variant/10">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-display text-sm font-bold text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-fixed text-base">shuffle</span>
                  Match Draw
                </h2>
                
                <button 
                  onClick={handleMobileDraw}
                  className="bg-primary-fixed hover:bg-primary-fixed-dim text-black px-2.5 py-1 rounded-md font-display text-[10px] font-bold flex items-center gap-1 shadow-md transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[12px] font-black">cycle</span> 
                  {drawSuccess ? 'Drawn!' : 'Draw'}
                </button>
              </div>

              <div className="space-y-2">
                {mobilePairs.map((pair, index) => (
                  <div key={index} className="bg-surface-container-highest p-3 rounded-lg border-l-4 border-primary-fixed flex justify-between items-center shadow">
                    <div className="flex-1">
                      <p className="font-display text-[9px] text-on-surface-variant/85 uppercase tracking-wide">Team 1</p>
                      <p className="font-sans text-xs text-on-surface text-left truncate w-28">{pair.team1}</p>
                    </div>
                    
                    <span className="material-symbols-outlined text-secondary-container text-xs mx-1">swords</span>

                    <div className="flex-1 text-right">
                      <p className="font-display text-[9px] text-on-surface-variant/85 uppercase tracking-wide">Team 2</p>
                      <p className="font-sans text-xs text-on-surface text-right truncate w-28">{pair.team2}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 3: Score Entry */}
            <section className="bg-surface-container p-4 rounded-xl shadow-md border border-outline-variant/10">
              <h2 className="font-display text-sm font-bold text-white mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary-fixed text-base">scoreboard</span>
                Round 1 Scores
              </h2>
              
              <div className="bg-surface-container-high p-4 rounded-lg border border-secondary-container/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-display text-[10px] font-bold text-primary-fixed bg-primary-container/10 px-2 py-0.5 rounded border border-primary-fixed/20">Court 1 Slot</span>
                  <span className="font-sans text-[11px] text-[#c3f400] font-bold flex items-center gap-1">
                    <span className="animate-pulse bg-[#c3f400] w-1.5 h-1.5 rounded-full inline-block"></span>
                    In Match
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  {/* Team 1 Score */}
                  <div className="flex-1 text-center">
                    <p className="font-sans text-xs text-on-surface-variant/90 mb-1 truncate">Team Rivera</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => team1Score > 0 && setTeam1Score(prev => prev - 1)}
                        className="w-5 h-5 rounded-full bg-surface-dim flex items-center justify-center text-xs border border-outline-variant select-none"
                      >
                        -
                      </button>
                      <span className="font-stats text-2xl font-black text-primary-fixed w-8">{team1Score}</span>
                      <button 
                        onClick={() => setTeam1Score(prev => prev + 1)}
                        className="w-5 h-5 rounded-full bg-surface-dim flex items-center justify-center text-xs border border-outline-variant select-none"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <span className="font-display text-sm text-on-surface-variant px-2 font-bold">-</span>

                  {/* Team 2 Score */}
                  <div className="flex-1 text-center">
                    <p className="font-sans text-xs text-on-surface-variant/90 mb-1 truncate">Team Chen</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => team2Score > 0 && setTeam2Score(prev => prev - 1)}
                        className="w-5 h-5 rounded-full bg-surface-dim flex items-center justify-center text-xs border border-outline-variant select-none"
                      >
                        -
                      </button>
                      <span className="font-stats text-2xl font-black text-white w-8">{team2Score}</span>
                      <button 
                        onClick={() => setTeam2Score(prev => prev + 1)}
                        className="w-5 h-5 rounded-full bg-surface-dim flex items-center justify-center text-xs border border-outline-variant select-none"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {activeNav === 'feed' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Club Match Feed</h3>
            
            <div className="bg-surface-container p-4 rounded-xl border border-surface-bright space-y-3">
              <div className="flex items-center gap-2">
                <span className="bg-[#c3f400] text-black text-[9px] font-bold px-2 py-0.5 rounded">CLUB UPDATE</span>
                <span className="text-[10px] text-on-surface-variant">2 hours ago</span>
              </div>
              <p className="text-xs text-on-surface">Summer Season Champions tournament is set to trigger on Wednesday Aug 14 near Court A. Lock in your invitations!</p>
            </div>

            <div className="bg-surface-container p-4 rounded-xl border border-surface-bright space-y-3">
              <div className="flex items-center gap-2">
                <span className="bg-secondary text-on-secondary text-[9px] font-bold px-2 py-0.5 rounded">NEW ARRIVAL</span>
                <span className="text-[10px] text-on-surface-variant">Yesterday</span>
              </div>
              <p className="text-xs text-on-surface">Marcus Chen has joined the lobby! He is rated UTR 9 and is currently undefeated in 8 matches.</p>
            </div>
          </div>
        )}

        {activeNav === 'score' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Active Scoreboards</h3>
            <div className="bg-surface-container p-4 rounded-xl border border-surface-bright divide-y divide-surface-bright space-y-3">
              <div className="flex justify-between items-center py-2">
                <span className="text-xs">Alex &amp; David</span>
                <span className="font-stats text-[#c3f400] text-lg">6 - 4 (Win)</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs">Sarah &amp; Emma</span>
                <span className="font-stats text-white text-lg">4 - 6</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs">Marcus &amp; James</span>
                <span className="font-stats text-on-surface-variant text-base">Match Scheduled</span>
              </div>
            </div>
          </div>
        )}

        {activeNav === 'profile' && (
          <div className="space-y-4 text-center p-4">
            <div className="w-16 h-16 rounded-full bg-[#c3f400]/20 text-[#c3f400] border border-[#c3f400] flex items-center justify-center text-xl font-bold mx-auto mb-2">
              RF
            </div>
            <div>
              <h4 className="font-display text-base font-bold text-white">Guest Player Lobby</h4>
              <p className="text-xs text-on-surface-variant">Lobby Level: NTRP 4.0</p>
            </div>
            <div className="bg-surface-container p-3 rounded-lg border border-surface-bright text-xs text-left space-y-1.5 mt-4">
              <p>🥇 Wins this Season: <strong className="text-primary-fixed">12</strong></p>
              <p>🎾 Preferred Court: <strong className="text-white">Metro Park Hardcourt 3</strong></p>
              <p>💼 Invitation Privileges: <strong className="text-white">Active Member</strong></p>
            </div>
          </div>
        )}

      </div>

      {/* BottomNavBar */}
      <nav className="absolute bottom-0 left-0 w-full z-45 bg-surface-container border-t border-secondary-container/20 flex justify-around items-center h-[72px] pb-2 rounded-t-2xl shadow-xl">
        <button 
          onClick={() => setActiveNav('feed')}
          className={`flex flex-col items-center justify-center p-2 rounded-full transition-all ${activeNav === 'feed' ? 'text-primary-fixed font-bold' : 'text-on-surface-variant hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeNav === 'feed' ? "'FILL' 1" : "'FILL' 0" }}>rss_feed</span>
          <span className="text-[10px] mt-0.5">Feed</span>
        </button>

        <button 
          onClick={() => setActiveNav('matches')}
          className={`flex flex-col items-center justify-center p-2 rounded-full transition-all ${activeNav === 'matches' ? 'text-primary-fixed font-bold' : 'text-on-surface-variant hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeNav === 'matches' ? "'FILL' 1" : "'FILL' 0" }}>sports_tennis</span>
          <span className="text-[10px] mt-0.5">Matches</span>
        </button>

        <button 
          onClick={() => setActiveNav('score')}
          className={`flex flex-col items-center justify-center p-2 rounded-full transition-all ${activeNav === 'score' ? 'text-primary-fixed font-bold' : 'text-on-surface-variant hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeNav === 'score' ? "'FILL' 1" : "'FILL' 0" }}>scoreboard</span>
          <span className="text-[10px] mt-0.5">Score</span>
        </button>

        <button 
          onClick={() => setActiveNav('profile')}
          className={`flex flex-col items-center justify-center p-2 rounded-full transition-all ${activeNav === 'profile' ? 'text-primary-fixed font-bold' : 'text-on-surface-variant hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeNav === 'profile' ? "'FILL' 1" : "'FILL' 0" }}>person</span>
          <span className="text-[10px] mt-0.5">Profile</span>
        </button>
      </nav>
    </div>
  );
}
