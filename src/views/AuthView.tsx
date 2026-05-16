import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';
type Status = 'idle' | 'submitting' | 'confirm-sent' | 'reset-sent' | 'error';

export default function AuthView() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStatus('idle');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (mode === 'signup') {
      if (password.length < 8) {
        setStatus('error');
        setError('password must be at least 8 characters.');
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/focus`,
        },
      });
      if (error) {
        setStatus('error');
        setError(error.message);
        return;
      }
      // If supabase project requires email confirmation, session will be null.
      if (!data.session) {
        setStatus('confirm-sent');
      }
      // If confirmation is OFF, the auth listener will pick up the new session
      // and redirect to /focus automatically.
      return;
    }

    // sign in
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      setStatus('error');
      setError(error.message);
      return;
    }
    // success — auth listener will redirect to /focus
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      setStatus('error');
      setError('enter your email above first.');
      return;
    }
    setStatus('submitting');
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/focus` },
    );
    if (error) {
      setStatus('error');
      setError(error.message);
    } else {
      setStatus('reset-sent');
    }
  }

  // ============================================================
  // render
  // ============================================================

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-2 text-center font-mono text-[12px] uppercase tracking-mono-wide text-ink-soft">
          noti-todo
        </div>
        <h1 className="mb-1 text-center font-serif text-[34px] font-semibold leading-tight">
          {mode === 'signup' ? 'start fresh' : 'welcome back'}
        </h1>
        <p className="mb-6 text-center font-serif text-[15px] italic text-ink-soft">
          one thing at a time.
        </p>

        {/* mode toggle */}
        <div className="mx-auto mb-5 inline-flex w-full rounded-pill border-2 border-ink bg-surface p-1 shadow-card-sm">
          <ModeTab active={mode === 'signin'} onClick={() => { setMode('signin'); reset(); }}>
            sign in
          </ModeTab>
          <ModeTab active={mode === 'signup'} onClick={() => { setMode('signup'); reset(); }}>
            sign up
          </ModeTab>
        </div>

        {status === 'confirm-sent' ? (
          <ConfirmSentCard email={email} onBack={() => { reset(); setPassword(''); }} />
        ) : status === 'reset-sent' ? (
          <ResetSentCard email={email} onBack={reset} />
        ) : (
          <form onSubmit={onSubmit} className="surface-card-lg overflow-hidden">
            <div className={clsx(
              'border-b-[2.5px] border-ink px-4 py-2.5 font-mono text-[13px] uppercase tracking-mono-wide',
              mode === 'signup' ? 'bg-mint' : 'bg-peach',
            )}>
              {mode === 'signup' ? 'create your account' : 'sign in with email'}
            </div>
            <div className="p-5">
              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
                email
              </label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@yourplace.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-3 w-full rounded-[10px] border-2 border-ink bg-bg-soft px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-faint focus:bg-surface"
              />

              <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
                password
              </label>
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'signup' ? 8 : 1}
                placeholder={mode === 'signup' ? 'at least 8 characters' : ''}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-4 w-full rounded-[10px] border-2 border-ink bg-bg-soft px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-faint focus:bg-surface"
              />

              <button
                type="submit"
                disabled={status === 'submitting' || !email || !password}
                className="btn btn-primary w-full text-[15px] disabled:opacity-60"
              >
                {status === 'submitting'
                  ? (mode === 'signup' ? 'creating…' : 'signing in…')
                  : (mode === 'signup' ? 'create account' : 'sign in')}
              </button>

              {error && (
                <p className="mt-3 text-[13px] text-rose-deep">{error}</p>
              )}

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="mt-4 block w-full text-center font-mono text-[11px] uppercase tracking-mono text-ink-soft underline"
                >
                  forgot password
                </button>
              )}
            </div>
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-mono text-ink-faint">
          {mode === 'signup'
            ? 'creating an account sets up your board automatically.'
            : 'no account? tap sign up.'}
        </p>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex-1 rounded-pill px-3 py-1.5 font-mono text-[12px] uppercase tracking-mono transition-colors',
        active ? 'bg-ink text-bg' : 'text-ink-soft',
      )}
    >
      {children}
    </button>
  );
}

function ConfirmSentCard({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="surface-card-lg overflow-hidden">
      <div className="border-b-[2.5px] border-ink bg-butter px-4 py-2.5 font-mono text-[13px] uppercase tracking-mono-wide">
        confirm your email
      </div>
      <div className="p-5 text-[14px] leading-relaxed">
        we sent a confirmation link to{' '}
        <span className="font-semibold">{email}</span>. tap it once, then come
        back here and sign in.
        <button
          type="button"
          onClick={onBack}
          className="mt-4 block font-mono text-[12px] uppercase tracking-mono text-ink-soft underline"
        >
          back
        </button>
      </div>
    </div>
  );
}

function ResetSentCard({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="surface-card-lg overflow-hidden">
      <div className="border-b-[2.5px] border-ink bg-mint px-4 py-2.5 font-mono text-[13px] uppercase tracking-mono-wide">
        check your inbox
      </div>
      <div className="p-5 text-[14px] leading-relaxed">
        password reset link sent to{' '}
        <span className="font-semibold">{email}</span>. tap it to set a new one.
        <button
          type="button"
          onClick={onBack}
          className="mt-4 block font-mono text-[12px] uppercase tracking-mono text-ink-soft underline"
        >
          back
        </button>
      </div>
    </div>
  );
}
