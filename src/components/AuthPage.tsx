import React, { useEffect, useState } from 'react';
import { invitationCallbackError, waitForAuthSession } from '../lib/auth-session';
import { getSupabaseBrowserClient } from '../lib/supabase';
import { useActivity } from '../lib/activity';
import type { ScreenMode } from '../types';

interface AuthPageProps {
  onSuccess: (email: string) => Promise<void>;
  onNavigate: (mode: ScreenMode) => void;
}

export default function AuthPage({ onSuccess, onNavigate }: AuthPageProps) {
  const { reportError, track } = useActivity();
  const setupMode = new URLSearchParams(window.location.search).get('setup') === '1';
  const callbackError = useState(() =>
    invitationCallbackError(window.location.search, window.location.hash),
  )[0];
  const [mode, setMode] = useState<'login' | 'setup' | 'recovery'>(setupMode ? 'setup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(callbackError ?? '');
  const [busy, setBusy] = useState(false);
  const [authReady, setAuthReady] = useState(!setupMode);

  useEffect(() => {
    if (!setupMode || callbackError) return;
    let active = true;
    void waitForAuthSession(getSupabaseBrowserClient().auth).then((hasSession) => {
      if (!active) return;
      setAuthReady(hasSession);
      if (!hasSession) {
        setError(
          'The invitation did not establish a session. Request a new invitation and open only the newest link.',
        );
      }
    });
    return () => {
      active = false;
    };
  }, [callbackError, setupMode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    if (mode === 'setup' && password.length < 12) {
      setError('Use at least 12 characters for the administrator password.');
      setBusy(false);
      return;
    }
    if (mode === 'setup' && password !== passwordConfirmation) {
      setError('The passwords do not match.');
      setBusy(false);
      return;
    }
    try {
      await track(async () => {
        const supabase = getSupabaseBrowserClient();
        if (mode === 'recovery') {
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/?setup=1`,
          });
          if (resetError) throw resetError;
          setMessage('Check your email for the secure password reset link.');
          return;
        }
        if (mode === 'setup') {
          if (!(await waitForAuthSession(supabase.auth, 1_000))) {
            throw new Error(
              'The invitation session is missing or expired. Request a new invitation and open only the newest link.',
            );
          }
          const { data, error: updateError } = await supabase.auth.updateUser({ password });
          if (updateError) throw updateError;
          window.history.replaceState({}, '', window.location.pathname);
          await onSuccess(data.user.email ?? email);
          return;
        }

        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        await onSuccess(data.user.email ?? email);
      });
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
      <div className="relative overflow-hidden bg-surface-container-high p-8 md:p-10">
        <div className="absolute inset-y-0 left-0 w-1 bg-primary-fixed" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary-fixed">Protected court access</p>
        <h1 className="mt-4 font-display text-4xl font-black leading-tight text-white">
          Administration without shared credentials.
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-6 text-on-surface-variant">
          Accounts are invitation-only. Supabase verifies your email and password; RallyFire then applies your database role and an eight-hour administrator session.
        </p>
        <div className="mt-10 space-y-3 text-xs text-on-surface-variant">
          <p className="flex gap-3"><span className="text-primary-fixed">01</span> Open the invitation sent by a superadministrator.</p>
          <p className="flex gap-3"><span className="text-primary-fixed">02</span> Set a unique password of at least 12 characters.</p>
          <p className="flex gap-3"><span className="text-primary-fixed">03</span> Reauthenticate after eight hours of admin access.</p>
        </div>
      </div>

      <div className="p-8 md:p-10">
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="mb-8 text-xs font-semibold text-on-surface-variant hover:text-primary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fixed"
        >
          Back to public site
        </button>
        <h2 className="font-display text-2xl font-extrabold text-white">
          {mode === 'setup' ? 'Set your password' : mode === 'recovery' ? 'Reset your password' : 'Administrator login'}
        </h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          {mode === 'setup'
            ? 'Finish the invitation or recovery flow before entering the console.'
            : mode === 'recovery'
              ? 'We will send a one-time recovery link to the administrator email.'
              : 'Use the email address that was invited to this club.'}
        </p>

        {error && <div role="alert" className="mt-5 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
        {message && <div role="status" className="mt-5 rounded-lg border border-primary-fixed/30 bg-primary-fixed/10 p-3 text-sm text-on-surface">{message}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode !== 'setup' && (
            <label className="block text-xs font-semibold text-on-surface-variant">
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 text-sm text-white outline-none focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30"
              />
            </label>
          )}
          {mode !== 'recovery' && (
            <label className="block text-xs font-semibold text-on-surface-variant">
              {mode === 'setup' ? 'New password' : 'Password'}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                minLength={mode === 'setup' ? 12 : undefined}
                required
                className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 text-sm text-white outline-none focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30"
              />
            </label>
          )}
          {mode === 'setup' && (
            <label className="block text-xs font-semibold text-on-surface-variant">
              Confirm new password
              <input
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                required
                className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-dim px-4 py-3 text-sm text-white outline-none focus:border-primary-fixed focus:ring-2 focus:ring-primary-fixed/30"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={busy || (mode === 'setup' && !authReady)}
            className="w-full rounded-lg bg-primary-fixed px-5 py-3 text-sm font-extrabold text-on-primary-fixed transition hover:bg-primary-fixed-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed disabled:cursor-wait disabled:opacity-60"
          >
            {busy
              ? 'Working...'
              : mode === 'setup' && !authReady && !callbackError
                ? 'Checking invitation...'
                : mode === 'setup'
                  ? 'Set password and continue'
                  : mode === 'recovery'
                    ? 'Send recovery link'
                    : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'recovery' ? 'login' : 'recovery');
            setError('');
            setMessage('');
          }}
          className="mt-5 text-xs font-semibold text-primary-fixed hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fixed"
        >
          {mode === 'recovery' ? 'Return to login' : 'Forgot password?'}
        </button>
      </div>
    </section>
  );
}
