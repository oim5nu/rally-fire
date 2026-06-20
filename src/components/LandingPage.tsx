import React, { useState } from 'react';
import { Player, ScreenMode } from '../types';

interface LandingPageProps {
  players: Player[];
  onNavigate: (mode: ScreenMode) => void;
  lang: 'en' | 'zh';
  setLang: (lang: 'en' | 'zh') => void;
}

export default function LandingPage({ players, onNavigate, lang, setLang }: LandingPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'high' | 'standard'>('all');
  const [rsvpCount, setRsvpCount] = useState(12);
  const [rsvped, setRsvped] = useState(false);

  // Filter play ranking list
  const filteredPlayers = players.filter(p => {
    if (selectedCategory === 'high') return p.ratingValue >= 4.0;
    if (selectedCategory === 'standard') return p.ratingValue < 4.0;
    return true;
  }).sort((a, b) => b.points - a.points);

  const handleRSVP = () => {
    if (rsvped) {
      setRsvpCount(prev => prev - 1);
      setRsvped(false);
    } else {
      setRsvpCount(prev => prev + 1);
      setRsvped(true);
      alert(lang === 'en' 
        ? 'Successfully RSVPed for Wednesday Doubles Night! We have saved your spot.' 
        : '成功报名！周三双打之夜的名额已预置。'
      );
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Section: Summer Season 2024 */}
      <section className="relative w-full min-h-[580px] flex items-center justify-center pt-8 pb-16 overflow-hidden rounded-2xl border border-surface-bright/40 bg-surface-dim/80">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-overlay"
            style={{ 
              backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuAm0EpUNJyHktNQQPHBhg7sspGa2DrjaKHK7oEROyl0MjgaBVVtEmS0JtID7rOzkx4v2WQktvihXHX8U0jy11B6n2AIytsHHjWx3Omeuu8yVh5yuaxlPXjaqVhDFI3VL5VMc_Y7l4UYgI_P1fFWG7tjJziTmOc9gpcZrWD8Eig-kHbKSk-zQ1mAurxSAlIElIBcJzpGt-VUq0rEMUiw-MFgdzbr0dAaAX3J1aRdj_k5M_0Oj7pNw6BzwOm79H5jUAkDKpcyXGU-tQ')` 
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent"></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 w-full flex flex-col items-center text-center">
          <div className="inline-block px-4 py-1.5 rounded-full bg-primary-container/10 border border-primary-container/30 mb-6">
            <span className="text-primary-container font-display text-xs font-bold tracking-wider uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              <span>{lang === 'en' ? 'Summer Season 2024' : '2024 夏季赛季'}</span>
            </span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight select-none">
            {lang === 'en' ? (
              <>High-Velocity<br /><span className="text-primary-container">Competitive Play.</span></>
            ) : (
              <>高强度<br /><span className="text-primary-container">竞技对决。</span></>
            )}
          </h1>

          <p className="font-sans text-body-lg text-on-surface-variant max-w-2xl mb-10 leading-relaxed">
            {lang === 'en' 
              ? 'Join the elite amateur league. Track your stats, dominate the leaderboard, and experience tennis with professional precision.'
              : '加入精英业余联赛。记录您的数据，称霸排行榜，体验专业级精准网球。'
            }
          </p>

          {/* Countdown Glassmorphism Card */}
          <div className="bg-surface-container/70 backdrop-blur-md border border-surface-bright/50 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-6 shadow-2xl w-full max-w-2xl">
            <div className="flex-grow text-left">
              <h3 className="font-display text-lg font-bold text-white mb-1">
                {lang === 'en' ? 'Next Big Match: The Invitational' : '下一场大战：邀请赛'}
              </h3>
              <p className="font-sans text-xs text-on-surface-variant">
                {lang === 'en' 
                  ? 'Registration closes soon. Secure your spot on the court.'
                  : '报名即将截止。锁定您的参赛名额。'
                }
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <div className="flex flex-col items-center">
                <div className="font-stats text-stats-number text-primary-container bg-surface-dim px-3 py-1.5 rounded-lg border border-surface-bright w-14 text-center">04</div>
                <span className="font-sans text-[10px] text-on-surface-variant uppercase mt-1">{lang === 'en' ? 'Days' : '天'}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="font-stats text-stats-number text-primary-container bg-surface-dim px-3 py-1.5 rounded-lg border border-surface-bright w-14 text-center">12</div>
                <span className="font-sans text-[10px] text-on-surface-variant uppercase mt-1">{lang === 'en' ? 'Hrs' : '时'}</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="font-stats text-stats-number text-primary-container bg-surface-dim px-3 py-1.5 rounded-lg border border-surface-bright w-14 text-center">45</div>
                <span className="font-sans text-[10px] text-on-surface-variant uppercase mt-1">{lang === 'en' ? 'Mins' : '分'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid: Recent Results & Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Results (Left 8 Columns) */}
        <section className="lg:col-span-8 bg-surface-container rounded-2xl border border-surface-bright p-6 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-container/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          
          <div className="flex justify-between items-center mb-6 relative z-10">
            <h2 className="font-display text-2xl font-bold text-white">
              {lang === 'en' ? 'Recent Results' : '近期赛果'}
            </h2>
            <button 
              onClick={() => onNavigate('player_mobile')}
              className="text-primary-container font-display text-sm hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{lang === 'en' ? 'View Match Screen' : '切换球员大厅'}</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
            {/* Scoreboard Card 1 */}
            <div className="bg-surface-dim border border-surface-bright rounded-lg overflow-hidden flex flex-col hover:border-outline-variant transition-colors group">
              <div className="bg-surface-container-highest px-4 py-2 flex justify-between items-center border-b border-surface-bright">
                <span className="text-xs text-on-surface-variant font-display font-semibold uppercase tracking-wider">Men&apos;s Singles · Quarterfinal</span>
                <span className="bg-primary-container/20 text-primary-container text-[10px] font-bold px-2 py-0.5 rounded-full">Completed</span>
              </div>
              <div className="flex-grow flex flex-col">
                {/* Winner Row */}
                <div className="flex items-center p-4 border-l-4 border-primary-container bg-surface-bright/20 border-b border-surface-bright">
                  <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-white font-bold mr-3 overflow-hidden shrink-0">
                    <img 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuCCZluK_1VgaXieH5wJR9JLJDpp7KYV-5PUSzLtWwfJHhz7ML_ediF09O4RTsWa-UFV1fZHerSjYshtiyU2hSwK8CXfkEL5UOBqkUhx_QkH8b4t7C5nVu3qjOzgoBFofFoT-l5E-23MlNihGhv28UQnqf1jTKOaHmXpUV4OC6bGO4sRmqScB2NLFAZzwITYTrxysqyTri2rIdEB55jlI392VTCb6lv0gzYYIIfhSjrS3tBVvNL4qYMHLYKDrUfPJFZgegiV4Q6luQ" 
                      alt="Player Profile Avatar"
                    />
                  </div>
                  <div className="flex-grow font-display text-sm font-bold text-white">Alex Rivera</div>
                  <div className="flex gap-4 font-stats text-lg text-white pl-4">
                    <span className="w-6 text-center text-primary-container">6</span>
                    <span className="w-6 text-center text-primary-container">7</span>
                  </div>
                </div>
                {/* Loser Row */}
                <div className="flex items-center p-4 border-l-4 border-transparent">
                  <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-surface-variant font-bold mr-3 overflow-hidden shrink-0">
                    <img 
                      className="w-full h-full object-cover opacity-70" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBzQbYx6gl_iAhHDGEx3YpP0I_vizliOfZlojTW82T-OuUJrGqKQU7zhy0aMm1zrddz-teUsc5I7KaUlYJLxDrSh-kFQEUnzAunOLaiiohRWd-7GMgoF4IS25v82OxcyJACT9xjdVNGhC6E66WpJ0YPzWVHMrbVN9YpVQRPti1XG1Xoyp6E30juMbNicX7rKXGXDxOqZahwholn4OQ0upFzQh52QA-8w0jTDcC5WgE6RWaGR4XN5xIjaYeQDK4GpwqtwKXcJoolOw" 
                      alt="Player Profile Avatar"
                    />
                  </div>
                  <div className="flex-grow font-sans text-sm text-on-surface-variant">David Kim</div>
                  <div className="flex gap-4 font-stats text-lg text-on-surface-variant pl-4">
                    <span className="w-6 text-center">4</span>
                    <span className="w-6 text-center">5</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scoreboard Card 2 */}
            <div className="bg-surface-dim border border-surface-bright rounded-lg overflow-hidden flex flex-col hover:border-outline-variant transition-colors group">
              <div className="bg-surface-container-highest px-4 py-2 flex justify-between items-center border-b border-surface-bright">
                <span className="text-xs text-on-surface-variant font-display font-semibold uppercase tracking-wider">Women&apos;s Singles · Round 2</span>
                <span className="bg-primary-container/20 text-primary-container text-[10px] font-bold px-2 py-0.5 rounded-full">Completed</span>
              </div>
              <div className="flex-grow flex flex-col">
                {/* Winner Row */}
                <div className="flex items-center p-4 border-l-4 border-primary-container bg-surface-bright/20 border-b border-surface-bright">
                  <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-white font-bold mr-3 overflow-hidden shrink-0">
                    <img 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDy4lHHFvuK5HIASvUq0id5XrMQJ4dD4S-uoOTnbRuRM4vQmQZstZqq8wFUlxunAYNDTMkXwkLSGrtcoS1TCU1oph2nsXotbg7aIhCSyt69xw8wLC9oXSDg8vevGuK-OFZ1iY9hmHdTLuRDz3uvZxaNAsDYOnBqMu-1Yh6tYpSkhW3MTMTCVwjTW4iVK5MBrXNMJ8Ts-leBgvf716icljufq5T1tIpOKQUdKPIwEgzzkYkcLWzDy5qtlGW8Z7ceL5FH4w66jxExww" 
                      alt="Player Profile Avatar"
                    />
                  </div>
                  <div className="flex-grow font-display text-sm font-bold text-white">Sarah Chen</div>
                  <div className="flex gap-4 font-stats text-lg text-white pl-4">
                    <span className="w-6 text-center text-primary-container">6</span>
                    <span className="w-6 text-center text-primary-container">6</span>
                  </div>
                </div>
                {/* Loser Row */}
                <div className="flex items-center p-4 border-l-4 border-transparent">
                  <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-surface-variant font-bold mr-3 overflow-hidden shrink-0">
                    <img 
                      className="w-full h-full object-cover opacity-70" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDCuDl5Q2gtdaEiLKkUaV2p4XH1uvsR4dzIgJOlyA5txGuELeqZ3EbH4WQMGadWrIi-YAZ9-rg9sIoClqIMttcr2d8ELVHpZGQ6AkG1pwAqixuIXcrPqWqVcJN1M3hs65lxy6MYatv7r8KV5czE67xecaxNRb66wB3rosOp18AzjTYsQBPg7_bnEt2zFRKkW2xqHAPEZ2WLKgvfsDH6OvhGJzJgMyz8l2sF_EIaRCJYzrdNWuyRa7Tp9bEt_6nMi1fh00x479ZdxQ" 
                      alt="Player Profile Avatar"
                    />
                  </div>
                  <div className="flex-grow font-sans text-sm text-on-surface-variant">Emma Davis</div>
                  <div className="flex gap-4 font-stats text-lg text-on-surface-variant pl-4">
                    <span className="w-6 text-center">2</span>
                    <span className="w-6 text-center">3</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Upcoming Event (Right 4 Columns) */}
        <section className="lg:col-span-4 bg-surface-container rounded-2xl border border-surface-bright overflow-hidden flex flex-col shadow-lg">
          <div className="h-28 w-full relative">
            <div 
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuBwnFUZkI2FFl3NJh3eGv2yytY7jRNP3MLoS8vOyl2iBPmbNPrPOV_iFkYOLimOARgjPbifH5t7xTu3PiU_icZ7u_G6SKASeo_CTgrVf5LQO0APVjwPUpKhSBv1KfSxQpFqaXdw4_LCTzSsiGD-6_j98ikz9zlaEI-TZn5dfVKqdHLhtBGw-KK5adDrUYHRVGJ0l55Q6EsnuWXmymke92oi2uD2Yw1bA24LBNSRYopep6zJSBE64XCm_fMiGN4xVDxrQYVdyRRYcA')`
              }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container to-transparent"></div>
            <div className="absolute bottom-3 left-4">
              <span className="bg-surface-dim/90 backdrop-blur text-primary-container font-sans text-[10px] font-bold px-2.5 py-1 rounded border border-surface-bright uppercase tracking-wider">
                {lang === 'en' ? 'Featured Event' : '精选赛事'}
              </span>
            </div>
          </div>

          <div className="p-5 flex-grow flex flex-col justify-between bg-surface-container">
            <div>
              <h3 className="font-display text-xl font-bold text-white mb-2">
                {lang === 'en' ? 'Wednesday Doubles Night' : '周三双打之夜'}
              </h3>
              <p className="font-sans text-xs text-on-surface-variant mb-4 leading-relaxed">
                {lang === 'en' 
                  ? 'Casual competitive round-robin format. All skill levels welcome. Meet local players and build your club rating.'
                  : '休闲竞技循环赛制。欢迎各级别球友。结识本地球友，提升您的俱乐部积分。'
                }
              </p>
              <ul className="space-y-2 mb-4">
                <li className="flex items-center text-xs text-on-surface">
                  <span className="material-symbols-outlined text-[#c3f400] text-sm mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>calendar_today</span>
                  <span>{lang === 'en' ? 'Wed, Oct 25 • 18:00 - 21:00' : '每周三晚 18:00 - 21:00'}</span>
                </li>
                <li className="flex items-center text-xs text-on-surface">
                  <span className="material-symbols-outlined text-[#c3f400] text-sm mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                  <span>{lang === 'en' ? 'Metro Park Tennis Center' : '市网球中心室外场'}</span>
                </li>
                <li className="flex items-center text-xs text-on-surface">
                  <span className="material-symbols-outlined text-[#c3f400] text-sm mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
                  <span>{rsvpCount} / 16 {lang === 'en' ? 'Players RSVPed' : '名球员已加入'}</span>
                </li>
              </ul>
            </div>

            <button 
              onClick={handleRSVP}
              className={`w-full py-2.5 rounded font-display text-xs font-bold transition-all ${rsvped ? 'bg-surface-bright text-white border border-outline-variant/65' : 'bg-transparent border border-[#c3f400] text-[#c3f400] hover:bg-[#c3f400] hover:text-on-primary'}`}
            >
              {lang === 'en' 
                ? (rsvped ? 'Cancel RSVP' : 'Register Now') 
                : (rsvped ? '取消报名' : '立即报名')
              }
            </button>
          </div>
        </section>
      </div>

      {/* Top Contenders (Leaderboard Preview) */}
      <section className="mt-8">
        <div className="flex justify-between items-end mb-6 border-b border-surface-bright pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white mb-1">
              {lang === 'en' ? 'Top Contenders' : '领跑者争霸榜'}
            </h2>
            <p className="text-on-surface-variant font-sans text-xs">
              {lang === 'en' ? 'Season Leaderboard · Men\'s & Women\'s Division A' : '赛季排行榜 · 精英A组'}
            </p>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => setSelectedCategory('all')} 
              className={`px-3 py-1 rounded text-xs transition-all ${selectedCategory === 'all' ? 'bg-[#c3f400]/20 text-[#c3f400] border border-[#c3f400]/30 font-semibold' : 'text-on-surface-variant'}`}
            >
              All
            </button>
            <button 
              onClick={() => setSelectedCategory('high')} 
              className={`px-3 py-1 rounded text-xs transition-all ${selectedCategory === 'high' ? 'bg-[#c3f400]/20 text-[#c3f400] border border-[#c3f400]/30 font-semibold' : 'text-on-surface-variant'}`}
            >
              High Skill
            </button>
            <button 
              onClick={() => setSelectedCategory('standard')} 
              className={`px-3 py-1 rounded text-xs transition-all ${selectedCategory === 'standard' ? 'bg-[#c3f400]/20 text-[#c3f400] border border-[#c3f400]/30 font-semibold' : 'text-on-surface-variant'}`}
            >
              Standard
            </button>
          </div>
        </div>

        <div className="bg-surface-container rounded-xl border border-surface-bright overflow-hidden shadow-lg">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-surface-bright bg-surface-container-highest text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            <div className="col-span-1 text-center">Rank</div>
            <div className="col-span-6 md:col-span-4">Player</div>
            <div className="hidden md:block col-span-3">Rating Progress</div>
            <div className="col-span-3 md:col-span-2 text-right">Win Streak</div>
            <div className="col-span-2 text-right">Points</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-surface-bright">
            {filteredPlayers.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant text-sm">No players match the criteria.</div>
            ) : (
              filteredPlayers.map((player, idx) => (
                <div 
                  key={player.id} 
                  className={`grid grid-cols-12 gap-4 p-4 items-center hover:bg-surface-bright/20 transition-colors ${idx === 0 ? 'bg-[#c3f400]/5' : ''}`}
                >
                  <div className={`col-span-1 text-center font-stats font-black text-lg ${idx === 0 ? 'text-[#c3f400]' : 'text-on-surface-variant'}`}>
                    {idx + 1}
                  </div>
                  
                  <div className="col-span-6 md:col-span-4 flex items-center">
                    <div className={`w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-white font-bold mr-3 overflow-hidden shrink-0 border ${idx === 0 ? 'border-[#c3f400] scale-105' : 'border-surface-bright'}`}>
                      {player.avatarUrl ? (
                        <img className="w-full h-full object-cover" src={player.avatarUrl} alt={player.name} referrerPolicy="no-referrer" />
                      ) : (
                        <span>{player.initials || player.name.substring(0,2)}</span>
                      )}
                    </div>
                    <div>
                      <span className="font-display text-sm font-bold text-white block">{player.name}</span>
                      <span className="text-[11px] text-on-surface-variant">{player.rating}</span>
                    </div>
                  </div>

                  <div className="hidden md:flex col-span-3 items-center">
                    <div className="w-full bg-surface-dim h-2 rounded-full overflow-hidden mr-3 border border-outline-variant/10">
                      <div 
                        className="bg-primary-container h-full" 
                        style={{ width: `${Math.min(player.ratingValue * 11, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-on-surface-variant w-14 shrink-0 font-bold">{player.rating}</span>
                  </div>

                  <div className="col-span-3 md:col-span-2 text-right text-xs">
                    <span className="bg-primary-container/10 text-primary-fixed px-2.5 py-1 rounded-full font-bold">
                      🔥 {player.winStreak} Streak
                    </span>
                  </div>

                  <div className="col-span-2 text-right font-stats text-sm font-bold text-white">
                    {player.points}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
