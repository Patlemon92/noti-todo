import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthView() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/focus`,
      },
    });
    if (error) {
      setStatus('error');
      setError(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-2 text-center font-mono text-[12px] uppercase tracking-mono-wide text-ink-soft">
          noti-todo
        </div>
        <h1 className="mb-1 text-center font-serif text-[34px] font-semibold leading-tight">
          welcome back
        </h1>
        <p className="mb-7 text-center font-serif text-[15px] italic text-ink-soft">
          one thing at a time.
        </p>

        {status === 'sent' ? (
          <div className="surface-card-lg overflow-hidden">
            <div className="border-b-[2.5px] border-ink bg-mint px-4 py-2.5 font-mono text-[13px] uppercase tracking-mono-wide">
              check your inbox
            </div>
            <div className="p-5 text-[14px] leading-relaxed">
              we sent a magic link to <span className="font-semibold">{email}</span>.
              tap it on this device to sign in.
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  setEmail('');
                }}
                className="mt-4 block font-mono text-[12px] uppercase tracking-mono text-ink-soft underline"
              >
                use a different email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="surface-card-lg overflow-hidden">
            <div className="border-b-[2.5px] border-ink bg-peach px-4 py-2.5 font-mono text-[13px] uppercase tracking-mono-wide">
              sign in with email
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
                className="mb-4 w-full rounded-[10px] border-2 border-ink bg-bg-soft px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-faint focus:bg-surface"
              />
              <button
                type="submit"
                disabled={status === 'sending' || !email}
                className="btn btn-primary w-full text-[15px] disabled:opacity-60"
              >
                {status === 'sending' ? 'sending…' : 'send magic link'}
              </button>
              {error && (
                <p className="mt-3 text-[13px] text-rose-deep">{error}</p>
              )}
            </div>
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-mono text-ink-faint">
          no passwords. ever.
        </p>
      </div>
    </div>
  );
}
