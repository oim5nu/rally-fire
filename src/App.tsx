import React, { useState } from 'react';
import { Player, MatchPair, ScreenMode } from './types';
import { INITIAL_PLAYERS, INITIAL_MATCHES } from './data';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import AdminDashboard from './components/AdminDashboard';
import MobileView from './components/MobileView';

export default function App() {
  const [screenMode, setScreenMode] = useState<ScreenMode>('landing');
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  
  // App-wide state
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [matches, setMatches] = useState<MatchPair[]>(INITIAL_MATCHES);
  
  // Simulated logged-in user state
  const [user, setUser] = useState<{ email: string; role: 'admin' | 'player' } | null>(null);

  const handleAuthSuccess = (role: 'admin' | 'player', email: string) => {
    setUser({ email, role });
    if (role === 'admin') {
      setScreenMode('admin');
    } else {
      setScreenMode('player_mobile');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setScreenMode('landing');
  };

  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] font-sans flex flex-col selection:bg-primary-container selection:text-on-primary-container">
      
      {/* Top Demo Navigation Switcher Header - Elegant & Helpful */}
      <div className="bg-[#060e20] text-xs py-2 px-4 border-b border-outline-variant/15 flex flex-wrap justify-between items-center z-50 sticky top-0 gap-3">
        <div className="flex items-center gap-1.5 text-on-surface-variant font-medium">
          <span className="animate-pulse bg-[#c3f400] w-2 h-2 rounded-full inline-block"></span>
          <span><strong>RallyFire Live Demo:</strong> Quick toggle between responsive screen modes:</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
            type="button" 
            onClick={() => setScreenMode('landing')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${screenMode === 'landing' ? 'bg-[#c3f400]/25 text-[#c3f400] border border-[#c3f400]/50' : 'text-on-surface-variant hover:text-white bg-surface-bright/20'}`}
          >
            🏠 Homepage
          </button>
          
          <button 
            type="button" 
            onClick={() => setScreenMode('auth')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${screenMode === 'auth' ? 'bg-[#c3f400]/25 text-[#c3f400] border border-[#c3f400]/50' : 'text-on-surface-variant hover:text-white bg-surface-bright/20'}`}
          >
            🔑 Auth Screen
          </button>
          
          <button 
            type="button" 
            onClick={() => setScreenMode('admin')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${screenMode === 'admin' ? 'bg-[#c3f400]/25 text-[#c3f400] border border-[#c3f400]/50' : 'text-on-surface-variant hover:text-white bg-surface-bright/20'}`}
          >
            🛡️ Admin Dashboard (Matrix, Split, Draw)
          </button>

          <button 
            type="button" 
            onClick={() => setScreenMode('player_mobile')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${screenMode === 'player_mobile' ? 'bg-[#c3f400]/25 text-[#c3f400] border border-[#c3f400]/50' : 'text-on-surface-variant hover:text-white bg-surface-bright/20'}`}
          >
            📱 Mobile Player View (Sleek UI)
          </button>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="bg-[#171f33]/90 shadow-md border-b border-surface-bright z-10 sticky top-[37px]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => setScreenMode('landing')}
              className="flex items-center gap-2 hover:opacity-85"
            >
              <span className="material-symbols-outlined text-primary-container text-3xl font-black">sports_tennis</span>
              <span className="font-display text-xl font-black text-primary-container italic tracking-tighter">RALLYFIRE</span>
            </button>
          </div>

          {/* Center Links (Desktop only) */}
          <nav className="hidden md:flex gap-6 items-center">
            <button 
              type="button" 
              onClick={() => {
                setScreenMode('landing');
                setTimeout(() => {
                  const element = document.getElementById('leaderboards');
                  if (element) element.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
              className="text-[#c4c9ac] hover:text-[#c3f400] transition-colors text-xs font-semibold"
            >
              {lang === 'en' ? 'Leaderboards' : '排行榜'}
            </button>
            <button 
              type="button" 
              onClick={() => setScreenMode('player_mobile')}
              className="text-[#c4c9ac] hover:text-[#c3f400] transition-colors text-xs font-semibold"
            >
              {lang === 'en' ? 'Matches' : '比赛对决'}
            </button>
            <button 
              type="button" 
              onClick={() => {
                alert(lang === 'en' ? 'Welcome to RallyFire Clubs! Full feature catalog under review.' : '欢迎！俱乐部更多高级特征正在审核。');
              }}
              className="text-[#c4c9ac] hover:text-[#c3f400] transition-colors text-xs font-semibold"
            >
              {lang === 'en' ? 'Clubs' : '俱乐部'}
            </button>
          </nav>

          {/* Right Area: Language Switcher, Logged In User, or Log In Button */}
          <div className="flex items-center gap-4">
            {/* Global Language Toggle */}
            <div className="flex items-center gap-1 bg-surface-container-high px-2 py-1 rounded border border-outline-variant/30 text-xs">
              <button 
                type="button" 
                onClick={() => setLang('en')} 
                className={`px-1.5 py-0.5 rounded transition-colors ${lang === 'en' ? 'bg-[#c3f400] text-black font-semibold' : 'text-on-surface-variant hover:text-white'}`}
              >
                EN
              </button>
              <button 
                type="button" 
                onClick={() => setLang('zh')} 
                className={`px-1.5 py-0.5 rounded transition-colors ${lang === 'zh' ? 'bg-[#c3f400] text-black font-semibold' : 'text-on-surface-variant hover:text-white'}`}
              >
                中文
              </button>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-[#c4c9ac] font-medium max-w-[120px] truncate">
                  Logged in as <strong className="text-white">{user.email.split('@')[0]}</strong> ({user.role})
                </span>
                
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="bg-surface-bright/70 hover:bg-surface-bright text-xs text-white font-semibold py-1.5 px-3 rounded border border-outline-variant/25 transition-all text-center"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button 
                type="button"
                onClick={() => setScreenMode('auth')}
                className="bg-[#c3f400] text-black text-xs font-extrabold px-5 py-2.5 rounded hover:bg-[#abd600] transition-all shadow-[0_0_8px_rgba(195,244,0,0.35)]"
              >
                {lang === 'en' ? 'Log In / Register' : '登录 / 注册'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-grow p-4 md:p-8 max-w-7xl mx-auto w-full">
        {screenMode === 'landing' && (
          <LandingPage 
            players={players} 
            onNavigate={setScreenMode} 
            lang={lang} 
            setLang={setLang}
          />
        )}

        {screenMode === 'auth' && (
          <AuthPage 
            onSuccess={handleAuthSuccess} 
            onNavigate={setScreenMode}
          />
        )}

        {screenMode === 'admin' && (
          <AdminDashboard 
            players={players}
            onPlayersChange={setPlayers}
            matches={matches}
            onMatchesChange={setMatches}
            lang={lang}
          />
        )}

        {screenMode === 'player_mobile' && (
          <MobileView 
            players={players} 
            matches={matches} 
            lang={lang} 
            setLang={setLang}
          />
        )}
      </main>

      {/* Footer Block */}
      <footer className="bg-surface-container-lowest border-t border-outline-variant/20 mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-center md:justify-start items-center gap-1.5">
              <span className="material-symbols-outlined text-primary-container text-2xl font-black">sports_tennis</span>
              <span className="font-display text-lg font-black text-primary-container italic tracking-tighter">RALLYFIRE</span>
            </div>
            <p className="text-xs text-on-surface-variant">
              &copy; {new Date().getFullYear()} RallyFire Tennis. All rights reserved. High-velocity competitive play.
            </p>
          </div>

          <nav className="flex flex-wrap justify-center gap-4 text-xs font-semibold text-[#c4c9ac]">
            <a href="#" className="hover:text-primary-fixed underline decoration-[#c3f400]/25 transition-all">About Us</a>
            <a href="#" className="hover:text-primary-fixed underline decoration-[#c3f400]/25 transition-all">Contact</a>
            <a href="#" className="hover:text-primary-fixed underline decoration-[#c3f400]/25 transition-all">Privacy Policy</a>
            <a href="#" className="hover:text-primary-fixed underline decoration-[#c3f400]/25 transition-all">Terms of Service</a>
            <a href="#" className="hover:text-primary-fixed underline decoration-[#c3f400]/25 transition-all">Tournament Rules</a>
          </nav>
        </div>
      </footer>

    </div>
  );
}
