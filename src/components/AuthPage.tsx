import React, { useState } from 'react';
import { ScreenMode } from '../types';

interface AuthPageProps {
  onSuccess: (role: 'admin' | 'player', email: string) => void;
  onNavigate: (mode: ScreenMode) => void;
}

export default function AuthPage({ onSuccess, onNavigate }: AuthPageProps) {
  const [activeTab, setActiveTab] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('player@rallyfire.com');
  const [password, setPassword] = useState('••••••••');
  const [inviteCode, setInviteCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 4) {
      setErrorMessage('Password must be at least 4 characters long.');
      return;
    }

    if (activeTab === 'signup') {
      if (!inviteCode) {
        setErrorMessage('Invitation code is required during our exclusive early phase.');
        return;
      }
      if (inviteCode.toLowerCase() !== 'rallyfire2024' && inviteCode.toLowerCase() !== 'admin' && inviteCode.toLowerCase() !== 'play') {
        setErrorMessage('Invalid invitation code. Use "RALLYFIRE2024" or "ADMIN" to preview!');
        return;
      }

      setSuccessMessage('Account created successfully! Welcome to the court.');
      setTimeout(() => {
        const isAdmin = inviteCode.toLowerCase() === 'admin' || email.includes('admin');
        onSuccess(isAdmin ? 'admin' : 'player', email);
      }, 1200);
    } else {
      // Login flow
      const isAdmin = email.includes('admin') || password === 'admin';
      setSuccessMessage('Logged in successfully!');
      setTimeout(() => {
        onSuccess(isAdmin ? 'admin' : 'player', email);
      }, 800);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-6 md:gap-10 rounded-2xl overflow-hidden bg-surface-container shadow-2xl relative border border-outline-variant/20">
      {/* Left Section: Branding & Imagery */}
      <div className="md:w-1/2 p-6 md:p-10 flex flex-col justify-between relative bg-surface-container-high overflow-hidden">
        {/* Decorative Grid Pattern */}
        <div className="absolute inset-0 opacity-15 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23c3f400\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]"></div>
        
        <div className="relative z-10 flex flex-col items-start gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container text-4xl p-1 bg-primary-container/10 rounded-lg">sports_tennis</span>
            <span className="font-display text-2xl font-black text-primary-container tracking-tighter italic">RALLYFIRE</span>
          </div>

          <div className="mt-4">
            <h1 className="font-display text-4xl font-extrabold text-[#c3f400] mb-2 leading-tight">Ignite Your Game</h1>
            <p className="font-sans text-body-md text-on-surface-variant leading-relaxed">
              Join the ultimate tennis community. Track stats, find high-fidelity matches, and climb the leaderboard.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-10 space-y-4">
          <div className="flex gap-2 items-center">
            <span className="material-symbols-outlined text-primary-fixed text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
            <span className="font-display text-lg font-bold text-on-surface">Welcome to RallyFire</span>
          </div>
          <div className="bg-surface-variant/40 p-4 rounded-xl border border-primary-fixed/20 backdrop-blur-sm">
            <p className="font-sans text-sm text-on-surface-variant mb-2">
              We&apos;re currently in an invitation-only phase to ensure the best experience for our early community members.
            </p>
            <p className="font-sans text-xs text-primary-fixed font-semibold">
              💡 Tip: Enter <span className="underline">RALLYFIRE2024</span> as invitation code, or set your email to include &quot;admin&quot; to test the Admin Dashboard!
            </p>
          </div>
        </div>
      </div>

      {/* Right Section: Auth Form */}
      <div className="md:w-1/2 p-6 md:p-10 bg-surface-container flex flex-col justify-center border-l border-outline-variant/10">
        {/* Navigation back and header */}
        <div className="flex justify-between items-center mb-6">
          <button 
            type="button"
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary-fixed transition-colors"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Home
          </button>
          
          <button 
            type="button"
            onClick={() => {
              // Quick bypass to admin
              onSuccess('admin', 'admin@rallyfire.com');
            }}
            className="text-[11px] bg-surface-bright text-on-surface-variant hover:text-primary-fixed px-2 py-1 rounded border border-outline-variant/30 transition-all font-semibold"
          >
            ⚡ Admin Debug Bypass
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-container-highest mb-6">
          <button 
            type="button"
            className={`w-1/2 pb-3 text-center font-display text-sm font-semibold transition-colors ${activeTab === 'signup' ? 'text-primary-fixed border-b-2 border-primary-fixed' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => {
              setActiveTab('signup');
              setErrorMessage('');
            }}
          >
            Sign Up
          </button>
          <button 
            type="button"
            className={`w-1/2 pb-3 text-center font-display text-sm font-semibold transition-colors ${activeTab === 'login' ? 'text-primary-fixed border-b-2 border-primary-fixed' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => {
              setActiveTab('login');
              setErrorMessage('');
            }}
          >
            Log In
          </button>
        </div>

        {/* Status messages */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-950/45 border border-red-500/30 text-red-200 text-xs rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400 text-sm">error</span>
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-950/45 border border-green-500/30 text-green-200 text-xs rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-green-400 text-sm">check_circle</span>
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1" htmlFor="email-input">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">mail</span>
              </span>
              <input 
                id="email-input"
                type="email"
                className="w-full bg-surface-dim border border-outline-variant text-on-surface rounded-lg py-2.5 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-primary-fixed/50 focus:border-transparent transition-all placeholder:text-on-surface-variant/40"
                placeholder="player@rallyfire.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-on-surface-variant" htmlFor="password-input">
                Password
              </label>
              {activeTab === 'login' && (
                <button
                  type="button"
                  onClick={() => alert('Check the Tip in the left panel to register/login!')}
                  className="text-xs text-primary-fixed hover:underline"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">lock</span>
              </span>
              <input 
                id="password-input"
                type="password"
                className="w-full bg-surface-dim border border-outline-variant text-on-surface rounded-lg py-2.5 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-primary-fixed/50 focus:border-transparent transition-all placeholder:text-on-surface-variant/40"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Invitation Code Input (Required for Signup) */}
          {activeTab === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1" htmlFor="invite-input">
                Invitation Code
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">confirmation_number</span>
                </span>
                <input 
                  id="invite-input"
                  type="text"
                  className="w-full bg-surface-dim border border-outline-variant text-on-surface rounded-lg py-2.5 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-primary-fixed/50 focus:border-transparent transition-all placeholder-on-surface-variant/50 placeholder:text-on-surface-variant/40"
                  placeholder="Enter RALLYFIRE2024 to join"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                />
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant/70 italic">
                Get codes from local club admins or enter standard codes like <strong className="text-primary-fixed">admin</strong> or <strong className="text-primary-fixed">RALLYFIRE2024</strong>.
              </p>
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit"
            className="w-full bg-primary-fixed text-on-primary-fixed font-semibold py-3 rounded-lg hover:bg-primary-fixed-dim transition-all shadow-[0_0_12px_rgba(195,244,0,0.3)] hover:shadow-[0_0_18px_rgba(195,244,0,0.5)] active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
          >
            <span>{activeTab === 'signup' ? 'Create Account' : 'Log In'}</span>
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </button>

          {/* Divider */}
          <div className="relative flex py-3 items-center">
            <div className="flex-grow border-t border-surface-container-highest"></div>
            <span className="flex-shrink mx-3 text-on-surface-variant text-xs font-semibold tracking-wider uppercase">
              Or CONTINUE WITH
            </span>
            <div className="flex-grow border-t border-surface-container-highest"></div>
          </div>

          {/* SSO Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button" 
              onClick={() => {
                setSuccessMessage('Google Connection simulated! Logged in.');
                setTimeout(() => onSuccess('player', 'google-player@rallyfire.com'), 1000);
              }}
              className="bg-surface-bright/50 hover:bg-surface-bright border border-outline-variant/30 text-on-surface text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer relative overflow-hidden group"
            >
              <img 
                alt="Google Logo" 
                className="w-4 h-4 shrink-0" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCflL_YkhIHumIs1E7rN9Q_w2KR6gQU_Li-sbjcLe8mLhupjUirKlz1uQBgw67PIrzcWfVe9CqcDudyAkcu5kTAsply9exak54V2pRT43c0uCESdlsqK_hJW98MwfArME3ZxzsOTTzVDZIbcCGIl894TQxghm4ZX7G4lrkPv3QP9TVCjGiAp6b-0YctNwN3iz_b5mCzvypdHW_iP8ZYRcnxCwejNQUuULJvMYQOWUmTpzQNUwz4x3WOmmMWvjYvaNWgofnj7IVxkQ"
              />
              Google
            </button>
            <button 
              type="button" 
              onClick={() => {
                setSuccessMessage('Microsoft Connection simulated! Logged in.');
                setTimeout(() => onSuccess('player', 'microsoft-player@rallyfire.com'), 1000);
              }}
              className="bg-surface-bright/50 hover:bg-surface-bright border border-outline-variant/30 text-on-surface text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer relative overflow-hidden group"
            >
              <img 
                alt="Microsoft Logo" 
                className="w-4 h-4 shrink-0" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAI8LWEAtKUBc4HPlkrghttGXxF2bo_7AQIKXGdN3i9Dgt9EdlDqyfVSLnFgevlVbqwx2SX9K8L0vN4-maMjLu-7SAGh3DnadTk5npWRZHesARPtDlo_75EkGgUtFbAr00mGOJ0tUn7U8CHvZFaZtShyRsQU638gkpec4LT773zdI86Axalvv0SFwhg4Ag5-UfgZPxVuM6i1KMeNTr4YbwjnZAYGjk_ifn-Ch65_zVybhTXk5l5sUYJQzrR9Oafga76IfIud-p_oQ"
              />
              Microsoft
            </button>
          </div>
          
          <p className="text-center text-[10px] text-on-surface-variant opacity-60 italic mt-4">
            Registration for Players requires an invitation code from a club administrator during the invite-only phase.
          </p>
        </form>
      </div>
    </div>
  );
}
