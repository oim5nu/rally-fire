import React, { useState } from 'react';
import { Player, MatchPair } from '../types';

interface AdminDashboardProps {
  players: Player[];
  onPlayersChange: (players: Player[]) => void;
  matches: MatchPair[];
  onMatchesChange: (matches: MatchPair[]) => void;
  lang: 'en' | 'zh';
}

export default function AdminDashboard({ 
  players, 
  onPlayersChange, 
  matches, 
  onMatchesChange, 
  lang 
}: AdminDashboardProps) {
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRating, setNewPlayerRating] = useState('4.0');
  const [newPlayerGroup, setNewPlayerGroup] = useState<'A' | 'B'>('A');

  // Score matrix states
  const [matrixScore1_2_A, setMatrixScore1_2_A] = useState<number | string>(6);
  const [matrixScore1_2_B, setMatrixScore1_2_B] = useState<number | string>(4);
  const [matrixScore2_1_A, setMatrixScore2_1_A] = useState<number | string>(3);
  const [matrixScore2_1_B, setMatrixScore2_1_B] = useState<number | string>(6);
  const [matrixScore3_A, setMatrixScore3_A] = useState<number | string>('');
  const [matrixScore3_B, setMatrixScore3_B] = useState<number | string>('');

  // Active pairs list
  const [drawnPairs, setDrawnPairs] = useState<Array<{ id: string; playerA: Player; playerB: Player; name: string }>>([
    {
      id: 'pair-1',
      playerA: players.find(p => p.id === 'p1') || players[0], // Alex Rivera
      playerB: players.find(p => p.id === 'p6') || players[5], // David Lee
      name: 'Pair #1'
    },
    {
      id: 'pair-2',
      playerA: players.find(p => p.id === 'p2') || players[1], // Sarah Chen
      playerB: players.find(p => p.id === 'p7') || players[6], // Emma Davis
      name: 'Pair #2'
    }
  ]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Move player between group A and B
  const toggleGroup = (playerId: string) => {
    const updated: Player[] = players.map(p => {
      if (p.id === playerId) {
        return { ...p, group: (p.group === 'A' ? 'B' : 'A') as 'A' | 'B' };
      }
      return p;
    });
    onPlayersChange(updated);
  };

  // Add a new player
  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    const newId = `p-${Date.now()}`;
    const newP: Player = {
      id: newId,
      name: newPlayerName.trim(),
      rating: `NTRP ${parseFloat(newPlayerRating).toFixed(1)}`,
      ratingValue: parseFloat(newPlayerRating),
      points: 100, // starting
      winRate: '50%',
      group: newPlayerGroup,
      winStreak: 0
    };

    onPlayersChange([...players, newP]);
    setNewPlayerName('');
    setSuccessMsg(`Added player "${newP.name}" to Group ${newP.group}!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Auto split based on rating score
  const handleAutoSplit = () => {
    const updated: Player[] = players.map((p) => {
      // higher rating goes to A, lower goes to B
      const rating = p.ratingValue;
      return { 
        ...p, 
        group: (rating >= 4.0 ? 'A' : 'B') as 'A' | 'B'
      };
    });
    onPlayersChange(updated);
    setSuccessMsg('Successfully auto-split players: Rank >= 4.0 moved to Group A!');
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  // Draw pairs randomly
  const handleExecuteDraw = () => {
    setIsDrawing(true);
    setSuccessMsg('');
    setTimeout(() => {
      const groupAPlayers = players.filter(p => p.group === 'A');
      const groupBPlayers = players.filter(p => p.group === 'B');

      if (groupAPlayers.length < 2 || groupBPlayers.length < 2) {
        alert('Make sure each group has at least 2 players to schedule pairs!');
        setIsDrawing(false);
        return;
      }

      // Shuffled arrays
      const shuffledA = [...groupAPlayers].sort(() => Math.random() - 0.5);
      const shuffledB = [...groupBPlayers].sort(() => Math.random() - 0.5);

      const count = Math.min(shuffledA.length, shuffledB.length, 3);
      const newPairs = [];
      for (let i = 0; i < count; i++) {
        newPairs.push({
          id: `pair-${i+1}`,
          playerA: shuffledA[i],
          playerB: shuffledB[i],
          name: `Pair #${i+1}`
        });
      }

      setDrawnPairs(newPairs);
      setIsDrawing(false);
      setSuccessMsg('Match Draw complete! Round robin court matchups are ready.');
      setTimeout(() => setSuccessMsg(''), 3500);
    }, 800);
  };

  // Save/finalize score matrix results and update leaderboard live
  const handleFinalize = () => {
    if (drawnPairs.length === 0) {
      alert('Pairs must be drawn before score cards can be saved.');
      return;
    }

    // Award bonus points based on score input
    const bonusPointsMap: Record<string, number> = {};

    // process Pair 1 vs Pair 2 score
    const s1A = Number(matrixScore1_2_A) || 0;
    const s1B = Number(matrixScore1_2_B) || 0;
    const pair1 = drawnPairs[0];
    const pair2 = drawnPairs[1];

    if (pair1 && pair2) {
      if (s1A > s1B) {
        // Pair 1 wins
        bonusPointsMap[pair1.playerA.id] = (bonusPointsMap[pair1.playerA.id] || 0) + 150;
        bonusPointsMap[pair1.playerB.id] = (bonusPointsMap[pair1.playerB.id] || 0) + 150;
        bonusPointsMap[pair2.playerA.id] = (bonusPointsMap[pair2.playerA.id] || 0) + 30;
        bonusPointsMap[pair2.playerB.id] = (bonusPointsMap[pair2.playerB.id] || 0) + 30;
      } else if (s1A < s1B) {
        // Pair 2 wins
        bonusPointsMap[pair2.playerA.id] = (bonusPointsMap[pair2.playerA.id] || 0) + 150;
        bonusPointsMap[pair2.playerB.id] = (bonusPointsMap[pair2.playerB.id] || 0) + 150;
        bonusPointsMap[pair1.playerA.id] = (bonusPointsMap[pair1.playerA.id] || 0) + 30;
        bonusPointsMap[pair1.playerB.id] = (bonusPointsMap[pair1.playerB.id] || 0) + 30;
      }
    }

    // process Pair 2 vs Pair 1 score
    const s2A = Number(matrixScore2_1_A) || 0;
    const s2B = Number(matrixScore2_1_B) || 0;
    if (pair1 && pair2) {
      if (s2A > s2B) {
        bonusPointsMap[pair1.playerA.id] = (bonusPointsMap[pair1.playerA.id] || 0) + 150;
        bonusPointsMap[pair1.playerB.id] = (bonusPointsMap[pair1.playerB.id] || 0) + 150;
        bonusPointsMap[pair2.playerA.id] = (bonusPointsMap[pair2.playerA.id] || 0) + 30;
        bonusPointsMap[pair2.playerB.id] = (bonusPointsMap[pair2.playerB.id] || 0) + 30;
      } else if (s2A < s2B) {
        bonusPointsMap[pair2.playerA.id] = (bonusPointsMap[pair2.playerA.id] || 0) + 150;
        bonusPointsMap[pair2.playerB.id] = (bonusPointsMap[pair2.playerB.id] || 0) + 150;
        bonusPointsMap[pair1.playerA.id] = (bonusPointsMap[pair1.playerA.id] || 0) + 30;
        bonusPointsMap[pair1.playerB.id] = (bonusPointsMap[pair1.playerB.id] || 0) + 30;
      }
    }

    // Update main state
    const updatedPlayers = players.map(p => {
      const bonus = bonusPointsMap[p.id] || 0;
      return {
        ...p,
        points: p.points + bonus,
        winStreak: bonus >= 150 ? p.winStreak + 1 : p.winStreak
      };
    });

    onPlayersChange(updatedPlayers);
    setSuccessMsg('Session finalized! Player points and leaderboard rankings updated immediately.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const groupA = players.filter(p => p.group === 'A');
  const groupB = players.filter(p => p.group === 'B');

  // Leaderboard data calculating points
  const sortedAdminLeaderboard = [...players].sort((a,b) => b.points - a.points);

  return (
    <div className="flex flex-col gap-6">
      {/* Dashboard Top Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-surface-container-high pb-4">
        <div>
          <span className="font-sans text-xs text-primary-fixed uppercase tracking-widest block mb-1">
            Summer League 2024 | {lang === 'en' ? 'SUMMER LEAGUE 2024' : '夏季联赛 2024'}
          </span>
          <h2 className="font-display text-3xl font-extrabold text-white">Wednesday Doubles Night</h2>
          <p className="font-sans text-sm text-on-surface-variant mt-0.5">周三双打之夜 — Admin Control Console</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-surface-container-high rounded-full px-4 py-2 flex items-center gap-2 border border-outline-variant/15 text-xs">
            <span className="material-symbols-outlined text-primary-fixed text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>calendar_month</span>
            <span className="text-on-surface font-semibold">Oct 25, 2024</span>
          </div>
          <div className="bg-surface-container-high rounded-full px-4 py-2 flex items-center gap-2 border border-outline-variant/15 text-xs">
            <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
            <span className="text-on-surface font-semibold">{players.length} Players Registered</span>
          </div>
        </div>
      </header>

      {/* State Feedback alerts */}
      {successMsg && (
        <div className="p-4 bg-primary-container/10 border border-primary-container/30 text-on-surface text-sm rounded-xl flex items-center gap-3">
          <span className="material-symbols-outlined text-[#c3f400]">check_circle</span>
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Admin actions block */}
      <div className="bg-surface-container/60 p-4 rounded-xl border border-surface-bright/50">
        <h4 className="text-xs font-bold uppercase text-on-surface-variant tracking-wider mb-3">Add Player to Session or Auto Group</h4>
        
        <div className="flex flex-col md:flex-row items-center gap-4">
          <form onSubmit={handleAddPlayer} className="flex-grow grid grid-cols-1 sm:grid-cols-4 gap-2 w-full">
            <input 
              type="text" 
              placeholder="Player Name (e.g. Leo Federer)" 
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              className="bg-surface-dim border border-outline-variant/70 text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary-fixed placeholder:text-on-surface-variant/40"
            />
            
            <select
              value={newPlayerRating}
              onChange={(e) => setNewPlayerRating(e.target.value)}
              className="bg-surface-dim border border-outline-variant/70 text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary-fixed"
            >
              <option value="3.0">NTRP 3.0 (Standard)</option>
              <option value="3.5">NTRP 3.5 (Intermediate)</option>
              <option value="4.0">NTRP 4.0 (Advanced)</option>
              <option value="4.5">NTRP 4.5 (High Skill)</option>
              <option value="5.0">NTRP 5.0 (Elite)</option>
            </select>

            <select
              value={newPlayerGroup}
              onChange={(e) => setNewPlayerGroup(e.target.value as 'A' | 'B')}
              className="bg-surface-dim border border-outline-variant/70 text-on-surface text-xs rounded px-3 py-2 focus:outline-none focus:border-primary-fixed"
            >
              <option value="A">Group A (High Skill)</option>
              <option value="B">Group B (Standard)</option>
            </select>

            <button 
              type="submit"
              className="bg-[#c3f400] hover:bg-[#abd600] text-black text-xs font-bold py-2 rounded transition-all cursor-pointer"
            >
              + Register Player
            </button>
          </form>

          <div className="shrink-0 w-full md:w-auto">
            <button 
              onClick={handleAutoSplit}
              className="w-full bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-bold py-2 px-4 rounded border border-outline-variant/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-xs">tune</span>
              Auto Group Standard
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid for Pairing & Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side (8 Columns): Player Grouping & Live pairing drawing */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Player Grouping Container */}
          <section className="bg-surface-container rounded-xl p-5 shadow-lg border border-surface-container-highest">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Player Grouping</h3>
                <p className="font-sans text-xs text-on-surface-variant">球员分组 (Click a card to trade group between A and B)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Group A (High Skill) */}
              <div className="bg-background rounded-lg border border-surface-container-high flex flex-col min-h-[300px] max-h-[400px] overflow-hidden">
                <div className="bg-surface-container-high p-3 border-b border-surface-container-highest flex justify-between items-center">
                  <h4 className="font-display text-xs font-bold text-primary-fixed uppercase">Group A (High Skill) / A组</h4>
                  <span className="bg-surface text-on-surface-variant px-2.5 py-0.5 rounded text-[11px] font-bold">{groupA.length}</span>
                </div>
                <div className="p-2 overflow-y-auto flex-grow space-y-1.5">
                  {groupA.map((p, idx) => (
                    <div 
                      key={p.id}
                      onClick={() => toggleGroup(p.id)}
                      className="bg-surface-container hover:bg-surface-variant p-2.5 rounded flex justify-between items-center cursor-pointer transition-colors border-l-2 border-primary-fixed group"
                      title="Click to move to Group B"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-surface-bright text-white flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <span className="font-sans text-xs font-bold text-white block">{p.name}</span>
                          <span className="text-[10px] text-on-surface-variant">Points: {p.points}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-primary-fixed/20 text-primary-fixed px-1.5 py-0.5 rounded text-[10px] font-bold">
                          {p.rating}
                        </span>
                        <span className="material-symbols-outlined text-xs text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">swap_horiz</span>
                      </div>
                    </div>
                  ))}
                  {groupA.length === 0 && (
                    <div className="text-center p-8 text-on-surface-variant text-xs">No players in Group A. Click a B player to add.</div>
                  )}
                </div>
              </div>

              {/* Group B (Standard Skill) */}
              <div className="bg-background rounded-lg border border-surface-container-high flex flex-col min-h-[300px] max-h-[400px] overflow-hidden">
                <div className="bg-surface-container-high p-3 border-b border-surface-container-highest flex justify-between items-center">
                  <h4 className="font-display text-xs font-bold text-secondary uppercase">Group B (Standard) / B组</h4>
                  <span className="bg-surface text-on-surface-variant px-2.5 py-0.5 rounded text-[11px] font-bold">{groupB.length}</span>
                </div>
                <div className="p-2 overflow-y-auto flex-grow space-y-1.5">
                  {groupB.map((p, idx) => (
                    <div 
                      key={p.id}
                      onClick={() => toggleGroup(p.id)}
                      className="bg-surface-container hover:bg-surface-variant p-2.5 rounded flex justify-between items-center cursor-pointer transition-colors border-l-2 border-secondary group"
                      title="Click to move to Group A"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-surface-bright text-white flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <span className="font-sans text-xs font-bold text-white block">{p.name}</span>
                          <span className="text-[10px] text-on-surface-variant">Points: {p.points}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-secondary/20 text-secondary px-1.5 py-0.5 rounded text-[10px] font-bold">
                          {p.rating}
                        </span>
                        <span className="material-symbols-outlined text-xs text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">swap_horiz</span>
                      </div>
                    </div>
                  ))}
                  {groupB.length === 0 && (
                    <div className="text-center p-8 text-on-surface-variant text-xs">No players in Group B. Click an A player to add.</div>
                  )}
                </div>
              </div>

            </div>
          </section>

          {/* Randomized draw section */}
          <section className="bg-surface-container rounded-xl p-5 shadow-lg border border-surface-container-highest relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 z-10 relative">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Draw &amp; Match</h3>
                <p className="font-sans text-xs text-on-surface-variant">抽签配對 (Match A and B standard by randomized draws)</p>
              </div>
              
              <button 
                onClick={handleExecuteDraw}
                disabled={isDrawing}
                className="bg-primary-container text-on-primary-container hover:bg-primary-fixed transition-all px-6 py-2.5 rounded-lg font-display text-xs font-bold flex items-center gap-1.5 glow-button disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">casino</span>
                {isDrawing ? "Drawing..." : "Execute Draw"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
              {drawnPairs.map((pair, index) => (
                <div key={pair.id} className="bg-background border border-surface-container-high rounded-xl p-4 flex flex-col gap-3 shadow-md">
                  <div className="flex justify-between items-center border-b border-surface-container-highest pb-2">
                    <span className="font-display text-xs font-bold text-[#c3f400] uppercase tracking-wide">
                      Pair #{index + 1}
                    </span>
                    <span className="material-symbols-outlined text-[#c3f400] text-sm">link</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-surface-container-highest text-primary-fixed flex items-center justify-center text-[10px] font-bold border border-primary-fixed/20">A{index+1}</span>
                      <span className="text-xs font-bold text-white truncate w-16">{pair.playerA.name}</span>
                    </div>
                    
                    <span className="text-on-surface-variant text-xs font-black">+</span>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate w-16 text-right">{pair.playerB.name}</span>
                      <span className="w-6 h-6 rounded-full bg-surface-container-highest text-secondary flex items-center justify-center text-[10px] font-bold border border-secondary/20">B{index+1}</span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="bg-surface border border-dashed border-outline-variant rounded-xl p-4 flex flex-col items-center justify-center opacity-65 text-center min-h-[96px]">
                <span className="material-symbols-outlined text-[#c3f400] mb-1">help</span>
                <span className="font-sans text-xs text-on-surface-variant">Ready for Round-Robin matrix matchups</span>
              </div>
            </div>
          </section>

        </div>

        {/* Right Side (4 Columns): Ranking Leaderboard & Actions */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Live Session Leaderboard */}
          <section className="bg-surface-container rounded-xl p-5 shadow-lg border border-surface-container-highest flex-grow flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-display text-base font-bold text-white">Session Leaders</h3>
                <p className="font-sans text-[11px] text-on-surface-variant">实时积分榜</p>
              </div>
              <span className="material-symbols-outlined text-primary-fixed">leaderboard</span>
            </div>

            <div className="bg-background rounded-lg border border-surface-container-high overflow-hidden flex-grow flex flex-col">
              <div className="grid grid-cols-12 gap-2 bg-surface-container-high p-3 border-b border-surface-container-highest text-[10px] font-semibold text-on-surface-variant uppercase">
                <div className="col-span-2 text-center">Rank</div>
                <div className="col-span-6">Player</div>
                <div className="col-span-4 text-right">Pts</div>
              </div>
              
              <div className="overflow-y-auto h-72 divide-y divide-surface-container-highest/40 p-1 space-y-1">
                {sortedAdminLeaderboard.slice(0, 7).map((player, idx) => (
                  <div 
                    key={player.id} 
                    className={`grid grid-cols-12 gap-2 p-2 rounded items-center ${idx === 0 ? 'bg-primary-container/10 border-l-2 border-primary-fixed' : 'hover:bg-surface-variant/45'}`}
                  >
                    <div className={`col-span-2 text-center font-stats font-bold text-xs ${idx === 0 ? 'text-[#c3f400]' : 'text-on-surface-variant'}`}>
                      {idx + 1}
                    </div>
                    <div className="col-span-6 font-semibold text-on-surface text-xs truncate">
                      {player.name}
                    </div>
                    <div className="col-span-4 text-right font-stats text-xs font-bold text-white">
                      {player.points}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* End Session Button Action */}
          <section className="bg-surface-container rounded-xl p-5 shadow-lg border border-primary-fixed/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-fixed/5 to-transparent pointer-events-none"></div>
            <h3 className="font-display text-base font-bold text-white mb-1">End Session</h3>
            <p className="font-sans text-[11px] text-on-surface-variant mb-4 leading-relaxed">
              Push and secure these scores into the major Summer Season League table. (结算并更新赛季积分)
            </p>
            <button 
              onClick={handleFinalize}
              className="w-full bg-primary-container text-on-primary-fixed hover:bg-[#abd600] transition-all py-3 rounded-lg font-display text-xs font-extrabold flex justify-center items-center gap-1.5 glow-button"
            >
              <span className="material-symbols-outlined text-sm">sync</span>
              Finalize &amp; Update Leaders
            </button>
          </section>

        </div>

      </div>

      {/* Round Robin Matrix Section at bottom */}
      <section className="bg-surface-container rounded-xl p-5 shadow-lg border border-surface-container-highest overflow-x-auto mt-2">
        <div className="flex justify-between items-center mb-4 min-w-[600px]">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Round Robin Score Matrix</h3>
            <p className="font-sans text-xs text-on-surface-variant">循环赛比分录入 (Scores modify leaderboard in real-time)</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-surface-bright rounded-full"></span>
              Pending Score
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#c3f400]/20 border border-[#c3f400] rounded-full"></span>
              Completed Score
            </span>
          </div>
        </div>

        <div className="min-w-[800px] border border-surface-container-high rounded-xl overflow-hidden bg-background">
          {/* Header Row */}
          <div className="flex bg-surface-container-high border-b border-surface-container-highest">
            <div className="w-36 p-3.5 font-display text-xs font-bold text-on-surface-variant border-r border-surface-container-highest">Teams / Pairs</div>
            <div className="flex-1 p-3.5 text-center font-display text-xs font-bold text-on-surface-variant border-r border-surface-container-highest">Pair 1 (Rivera/Lee)</div>
            <div className="flex-1 p-3.5 text-center font-display text-xs font-bold text-on-surface-variant border-r border-surface-container-highest">Pair 2 (Chen/Davis)</div>
            <div className="flex-1 p-3.5 text-center font-display text-xs font-bold text-on-surface-variant">Pair 3 (Standard Slot)</div>
          </div>

          {/* Pair 1 Row */}
          <div className="flex border-b border-surface-container-highest items-center">
            <div className="w-36 p-3.5 bg-surface-container flex flex-col items-center justify-center font-display text-xs font-bold text-on-surface border-r border-surface-container-highest text-center">
              Pair 1 <br />
              <span className="text-[10px] text-on-surface-variant font-normal">Alex &amp; David</span>
            </div>
            
            <div className="flex-1 p-3.5 bg-background flex items-center justify-center border-r border-surface-container-highest text-center">
              <span className="material-symbols-outlined text-surface-container-highest text-3xl">block</span>
            </div>

            {/* Match between 1 and 2 */}
            <div className="flex-1 p-3.5 bg-primary-fixed/5 border-r border-surface-container-highest flex items-center justify-center gap-2">
              <input 
                type="number" 
                value={matrixScore1_2_A} 
                onChange={(e) => setMatrixScore1_2_A(e.target.value)}
                className="w-10 bg-surface border border-outline-variant rounded text-center text-primary-fixed font-stats font-bold focus:border-primary-fixed focus:outline-none"
              />
              <span className="text-on-surface-variant">-</span>
              <input 
                type="number" 
                value={matrixScore1_2_B} 
                onChange={(e) => setMatrixScore1_2_B(e.target.value)}
                className="w-10 bg-surface border border-outline-variant rounded text-center text-white font-stats font-bold focus:border-primary-fixed focus:outline-none"
              />
              <span className="text-[10px] text-primary-fixed px-1 py-0.5 bg-primary-container/10 rounded font-bold">Saved</span>
            </div>

            <div className="flex-1 p-3.5 bg-surface-bright/40 text-center flex justify-center items-center">
              <span className="text-xs text-on-surface-variant italic">N/A</span>
            </div>
          </div>

          {/* Pair 2 Row */}
          <div className="flex items-center">
            <div className="w-36 p-3.5 bg-surface-container flex flex-col items-center justify-center font-display text-xs font-bold text-on-surface border-r border-surface-container-highest text-center">
              Pair 2 <br />
              <span className="text-[10px] text-on-surface-variant font-normal">Sarah &amp; Emma</span>
            </div>

            {/* Match between 2 and 1 */}
            <div className="flex-1 p-3.5 bg-primary-fixed/5 border-r border-surface-container-highest flex items-center justify-center gap-2">
              <input 
                type="number" 
                value={matrixScore2_1_A} 
                onChange={(e) => setMatrixScore2_1_A(e.target.value)}
                className="w-10 bg-surface border border-outline-variant rounded text-center text-white font-stats font-bold focus:border-primary-fixed focus:outline-none"
              />
              <span className="text-on-surface-variant">-</span>
              <input 
                type="number" 
                value={matrixScore2_1_B} 
                onChange={(e) => setMatrixScore2_1_B(e.target.value)}
                className="w-10 bg-surface border border-outline-variant rounded text-center text-primary-fixed font-stats font-bold focus:border-primary-fixed focus:outline-none"
              />
              <span className="text-[10px] text-primary-fixed px-1 py-0.5 bg-primary-container/10 rounded font-bold">Saved</span>
            </div>

            <div className="flex-1 p-3.5 bg-background flex items-center justify-center border-r border-surface-container-highest text-center">
              <span className="material-symbols-outlined text-surface-container-highest text-3xl">block</span>
            </div>

            {/* Live slot for pair 3 */}
            <div className="flex-grow flex items-center justify-center p-3.5">
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  placeholder="0"
                  value={matrixScore3_A} 
                  onChange={(e) => setMatrixScore3_A(e.target.value)}
                  className="w-10 bg-surface border border-outline-variant rounded text-center text-white font-stats font-semibold placeholder:text-on-surface-variant/30"
                />
                <span className="text-on-surface-variant">-</span>
                <input 
                  type="number" 
                  placeholder="0"
                  value={matrixScore3_B} 
                  onChange={(e) => setMatrixScore3_B(e.target.value)}
                  className="w-10 bg-surface border border-outline-variant rounded text-center text-white font-stats font-semibold placeholder:text-on-surface-variant/30"
                />
                <button 
                  onClick={() => {
                    if (matrixScore3_A !== '' && matrixScore3_B !== '') {
                      alert('Score entered for Pair 3!');
                    } else {
                      alert('Please input a valid score for Pair 3.');
                    }
                  }}
                  className="bg-primary-fixed hover:bg-primary-fixed-dim text-black text-[10px] font-bold px-2 py-1 rounded"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
