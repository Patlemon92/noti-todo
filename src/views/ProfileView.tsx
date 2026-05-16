import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import clsx from 'clsx';

import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import Sheet from '../components/ui/Sheet';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import {
  getMyProfile,
  getStats,
  updateMyProfile,
  type FocusStats,
  type ProfileSummary,
} from '../lib/db';
import {
  ensurePushSubscription,
  getPushSupport,
  removeThisDeviceSubscription,
  type PushSupport,
} from '../lib/push';

export default function ProfileView() {
  const nav = useNavigate();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [support, setSupport] = useState<PushSupport>({ kind: 'supported' });
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown');
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'shown' | 'failed'>('idle');
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [p, s] = await Promise.all([getMyProfile(), getStats()]);
        setProfile(p);
        setStats(s);
      } catch {
        // soft fail
      }
    })();
    const sup = getPushSupport();
    setSupport(sup);
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    void refreshSubStatus();
  }, []);

  async function refreshSubStatus() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }

  async function onEnablePush() {
    const r = await ensurePushSubscription();
    if (r.ok) {
      setPermission(Notification.permission);
      void refreshSubStatus();
    }
  }

  async function onDisablePush() {
    await removeThisDeviceSubscription();
    void refreshSubStatus();
  }

  async function onTestNotification() {
    setTestStatus('running');
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('test from noti-todo', {
        body: 'this is what a reminder will look like on this device.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
      });
      setTestStatus('shown');
      window.setTimeout(() => setTestStatus('idle'), 2000);
    } catch {
      setTestStatus('failed');
      window.setTimeout(() => setTestStatus('idle'), 2500);
    }
  }

  async function saveDisplayName(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === profile?.display_name) return;
    setProfile((cur) => (cur ? { ...cur, display_name: trimmed } : cur));
    await updateMyProfile({ display_name: trimmed });
  }

  async function doSignOut() {
    if (!window.confirm('sign out of noti-todo on this device?')) return;
    await signOut();
    nav('/auth', { replace: true });
  }

  const email = user?.email ?? '';
  const displayName = profile?.display_name || email.split('@')[0] || 'you';
  const initial = (displayName[0] || 'n').toUpperCase();
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), 'MMMM yyyy').toLowerCase()
    : '';

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-narrow">
        <TopStrip right="minimal" />

        {/* avatar + name */}
        <div className="px-5 pb-4 pt-2 text-center">
          <div className="mx-auto mb-3 flex h-[96px] w-[96px] items-center justify-center rounded-full border-[2.5px] border-ink bg-bg-soft shadow-[4px_4px_0_var(--ink)]">
            <span className="font-serif text-[44px] font-semibold leading-none text-ink">
              {initial}
            </span>
          </div>
          <InlineName value={displayName} onSave={saveDisplayName} />
          <div className="mt-1 font-mono text-[12px] uppercase tracking-mono text-ink-soft">
            {email}
          </div>
          {memberSince && (
            <div className="mt-2 font-mono text-[10px] uppercase tracking-mono-wide text-ink-faint">
              member since {memberSince}
            </div>
          )}
        </div>

        {/* stats */}
        <div className="surface-card mx-3.5 mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b-[1.5px] border-dashed border-ink bg-mint px-3.5 py-2.5">
            <h3 className="font-mono text-[13px] uppercase tracking-mono-wide">
              ★ today
            </h3>
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
              live
            </span>
          </div>
          <div className="grid grid-cols-3 gap-px bg-ink/10">
            <StatCell label="tasks done" value={stats?.completedToday ?? '—'} />
            <StatCell label="wins" value={stats?.winsToday ?? '—'} />
            <StatCell label="open" value={stats?.openTasks ?? '—'} />
          </div>
          <div className="flex items-baseline justify-between border-t border-dashed border-black/[0.18] bg-bg-soft px-3.5 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
              completed all-time
            </span>
            <span className="font-mono text-[15px] tabular-nums">
              {stats?.completedTotal ?? '—'}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-t border-dashed border-black/[0.18] bg-bg-soft px-3.5 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
              pages total
            </span>
            <span className="font-mono text-[15px] tabular-nums">
              {stats?.totalPages ?? '—'}
            </span>
          </div>
        </div>

        {/* push */}
        <div className="surface-card mx-3.5 mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b-[1.5px] border-dashed border-ink bg-sky px-3.5 py-2.5">
            <h3 className="font-mono text-[13px] uppercase tracking-mono-wide">
              ↻ notifications
            </h3>
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
              this device
            </span>
          </div>
          <div className="px-3.5 py-3.5">
            {support.kind === 'unsupported' && (
              <div className="mb-3 rounded-[10px] border-[1.5px] border-butter-deep bg-butter px-3 py-2 text-[13px] leading-snug">
                lock-screen push isn't available here:{' '}
                <em>{support.reason}</em>.
              </div>
            )}

            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold">
                  {subscribed ? 'on' : 'off'}
                </div>
                <div className="text-[12px] text-ink-soft">
                  permission: {permission}
                </div>
              </div>
              {subscribed ? (
                <button onClick={onDisablePush} className="btn text-[13px]">
                  turn off
                </button>
              ) : (
                <button
                  onClick={onEnablePush}
                  disabled={support.kind === 'unsupported'}
                  className="btn btn-primary text-[13px] disabled:opacity-50"
                >
                  enable
                </button>
              )}
            </div>

            <button
              onClick={onTestNotification}
              disabled={support.kind === 'unsupported' || permission !== 'granted'}
              className="pill-action w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testStatus === 'idle' && '✦ show test notification'}
              {testStatus === 'running' && 'showing…'}
              {testStatus === 'shown' && '✓ check your screen'}
              {testStatus === 'failed' && '✕ failed — check permissions'}
            </button>
          </div>
        </div>

        {/* account */}
        <div className="surface-card mx-3.5 mb-4 overflow-hidden">
          <div className="border-b-[1.5px] border-dashed border-ink bg-peach px-3.5 py-2.5">
            <h3 className="font-mono text-[13px] uppercase tracking-mono-wide">
              ⌂ account
            </h3>
          </div>
          <div className="flex flex-col gap-2 px-3.5 py-3.5">
            <button
              onClick={() => setPasswordOpen(true)}
              className="flex items-center justify-between rounded-[12px] border-[1.5px] border-ink-faint bg-surface px-3 py-2.5 text-left text-[14px] font-medium transition-colors hover:border-ink"
            >
              change password
              <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
                →
              </span>
            </button>
            <button
              onClick={doSignOut}
              className="flex items-center justify-between rounded-[12px] border-[1.5px] border-rose-deep bg-rose/30 px-3 py-2.5 text-left text-[14px] font-semibold text-ink transition-colors hover:bg-rose/50"
            >
              sign out
              <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
                →
              </span>
            </button>
          </div>
        </div>

        <div className="mb-2 mt-6 text-center font-mono text-[10px] uppercase tracking-mono-wide text-ink-faint">
          noti-todo · v0.1 · built in sydney
        </div>
      </div>

      <ChangePasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <BottomNav />
    </div>
  );
}

// ============================================================================
// inline-editable display name
// ============================================================================
function InlineName({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) void onSave(draft.trim());
    else setDraft(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        maxLength={40}
        className="mx-auto inline-block rounded-[10px] border-2 border-ink bg-surface px-2 py-1 font-serif text-[26px] font-semibold leading-tight outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-baseline gap-1.5"
      title="click to rename"
    >
      <span className="font-serif text-[26px] font-semibold leading-tight">
        {value}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-mono text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
        ✎
      </span>
    </button>
  );
}

// ============================================================================
// change password sheet — supabase auth.updateUser
// ============================================================================
function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNext('');
      setStatus('idle');
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (next.length < 8) {
      setError('password must be at least 8 characters.');
      setStatus('error');
      return;
    }
    setStatus('saving');
    setError(null);
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      setError(error.message);
      setStatus('error');
      return;
    }
    setStatus('saved');
    window.setTimeout(onClose, 1100);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="change password"
      subtitle="you'll stay signed in on this device after saving."
    >
      <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
        new password
      </label>
      <input
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="at least 8 characters"
        className="mb-3 w-full rounded-[10px] border-2 border-ink bg-surface px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-faint"
      />
      {error && (
        <p className="mb-3 text-[13px] text-rose-deep">{error}</p>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="btn flex-1">
          cancel
        </button>
        <button
          onClick={submit}
          disabled={status === 'saving' || !next}
          className={clsx(
            'btn flex-1',
            status === 'saved' ? 'btn-primary' : 'btn-primary',
            'disabled:opacity-60',
          )}
        >
          {status === 'saving' ? 'saving…' : status === 'saved' ? '✓ saved' : 'save'}
        </button>
      </div>
    </Sheet>
  );
}

// ============================================================================
// stat cell
// ============================================================================
function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-surface px-2 py-3 text-center">
      <span className="font-serif text-[26px] font-semibold leading-none tabular-nums">
        {value}
      </span>
      <span className="mt-1 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
        {label}
      </span>
    </div>
  );
}
