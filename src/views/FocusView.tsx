import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import { useFocusTask } from '../hooks/useFocusTask';
import { useWins } from '../hooks/useWins';
import { docToPlaintext, snippet } from '../lib/tiptap';
import { getPage } from '../lib/db';
import type { Page } from '../lib/types';
import QuickAddSheet from '../components/page/QuickAddSheet';
import SnoozeSheet from '../components/page/SnoozeSheet';
import { completeTask } from '../lib/db';

function colorForParent(id: string | null | undefined): string {
  if (!id) return '#8db4c8';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const palette = ['#8db4c8', '#7fb389', '#a896d4', '#e88562', '#e8c75f'];
  return palette[Math.abs(h) % palette.length];
}

export default function FocusView() {
  const nav = useNavigate();
  const {
    current,
    alternatives,
    loading,
    error,
    totalCount,
    skippedCount,
    skip,
    resetSkipped,
    reload,
  } = useFocusTask();
  const { wins, reload: reloadWins } = useWins();
  const [parents, setParents] = useState<Record<string, Page | null>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [snoozePage, setSnoozePage] = useState<Page | null>(null);

  // load parent labels for current + alts
  useEffect(() => {
    const targets = [current, ...alternatives].filter(Boolean) as Page[];
    const want = Array.from(
      new Set(targets.map((t) => t.parent_id).filter(Boolean) as string[]),
    );
    const missing = want.filter((id) => !(id in parents));
    if (missing.length === 0) return;
    Promise.all(missing.map((id) => getPage(id).then((p) => [id, p] as const))).then(
      (rows) => {
        setParents((cur) => {
          const next = { ...cur };
          for (const [id, p] of rows) next[id] = p;
          return next;
        });
      },
    );
  }, [current, alternatives, parents]);

  const startCurrent = useCallback(() => {
    if (current) nav(`/page/${current.id}`);
  }, [current, nav]);

  const hero = current
    ? {
        title: current.title || 'untitled task',
        parentLabel: parents[current.parent_id ?? '']?.title || 'inbox',
        ageLabel: `started ${formatDistanceToNowStrict(new Date(current.created_at))} ago`,
        preview: snippet(docToPlaintext(current.body), 100),
      }
    : null;

  // Three "no current task" states:
  //   - loading (briefly)
  //   - errored (show error + retry)
  //   - skipped them all (totalCount > 0 but all dismissed this session)
  //   - genuinely empty (no tasks at all)

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-narrow">
      <TopStrip onAdd={() => setAddOpen(true)} />

      <div className="px-3.5 pt-2.5 pb-1 text-center font-mono text-[13px] uppercase tracking-mono-wide text-ink-soft">
        right now
      </div>
      <div className="px-5 pb-4 text-center font-serif text-[17px] italic text-ink-soft">
        just this one thing.
      </div>

      {hero && current ? (
        <div className="surface-card-lg mx-3.5 mb-3.5 overflow-hidden">
          <div className="flex items-center justify-between border-b-[2.5px] border-ink bg-peach px-3.5 py-2">
            <div className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-mono">
              <span
                className="block h-[9px] w-[9px] rounded-full border-[1.5px] border-ink"
                style={{ background: colorForParent(current.parent_id) }}
              />
              <span>{hero.parentLabel}</span>
            </div>
            <span className="font-mono text-[13px] uppercase tracking-mono opacity-60">
              {hero.ageLabel}
            </span>
          </div>
          <div className="px-5 pb-4 pt-5">
            <h2 className="mb-3.5 font-serif text-[26px] font-semibold leading-tight tracking-[-0.01em]">
              {hero.title}
            </h2>
            {hero.preview && (
              <div className="relative rounded-[12px] border-[1.5px] border-ink bg-butter px-3.5 py-2.5 pl-9 text-[13.5px] leading-snug">
                <span className="absolute left-3 top-2.5 text-[14px]">✎</span>
                <span className="block font-mono text-[11px] uppercase tracking-mono-wide opacity-55">
                  notes
                </span>
                {hero.preview}
              </div>
            )}
          </div>
          <div className="flex gap-2 px-5 pb-5">
            <button
              onClick={startCurrent}
              className="flex-[2] rounded-[14px] border-2 border-ink bg-ink px-4 py-3.5 text-[16px] font-bold text-bg shadow-coral active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_var(--peach-deep)]"
            >
              ▶ open task
            </button>
            <button
              onClick={async () => {
                await completeTask(current.id, current.title || 'untitled task');
                skip(current.id);
                void reload();
                void reloadWins();
              }}
              title="done"
              className="rounded-[14px] border-2 border-ink bg-mint px-4 py-3.5 text-[16px] font-bold text-ink shadow-card active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              ✓
            </button>
            <button
              onClick={() => setSnoozePage(current)}
              title="snooze"
              className="rounded-[14px] border-2 border-ink bg-transparent px-4 py-3.5 text-[16px] font-semibold text-ink shadow-card active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              ↻
            </button>
          </div>
        </div>
      ) : loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : skippedCount > 0 && totalCount > 0 ? (
        <SkippedAllState
          totalCount={totalCount}
          skippedCount={skippedCount}
          onReset={resetSkipped}
          onAdd={() => setAddOpen(true)}
          onBoards={() => nav('/boards')}
        />
      ) : (
        <EmptyState
          onAdd={() => setAddOpen(true)}
          onBoards={() => nav('/boards')}
        />
      )}

      {alternatives.length > 0 && (
        <div className="mx-3.5 mb-4">
          <div className="flex items-baseline justify-between px-1 pb-2">
            <span className="font-mono text-[12px] uppercase tracking-mono text-ink-soft">
              ↳ or maybe…
            </span>
            {skippedCount > 0 && (
              <button
                onClick={resetSkipped}
                className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline"
              >
                show {skippedCount} skipped
              </button>
            )}
          </div>
          {alternatives.map((p) => (
            <Link
              key={p.id}
              to={`/page/${p.id}`}
              className="mb-1.5 flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-ink bg-surface px-3 py-2.5 text-[13.5px] shadow-card-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              <span
                className="block h-[9px] w-[9px] flex-shrink-0 rounded-full border-[1.5px] border-ink"
                style={{ background: colorForParent(p.parent_id) }}
              />
              <span className="flex-shrink-0 font-mono text-[11px] uppercase tracking-mono text-ink-soft">
                {(parents[p.parent_id ?? '']?.title || 'inbox')
                  .toString()
                  .toUpperCase()
                  .slice(0, 12)}
              </span>
              <span className="flex-1 font-medium">{p.title || 'untitled'}</span>
            </Link>
          ))}
        </div>
      )}

      {wins.length > 0 && (
        <div className="mx-3.5 rounded-[18px] border-2 border-ink bg-mint px-4 py-3 shadow-card">
          <div className="mb-2 flex items-baseline justify-between font-mono text-[14px] uppercase tracking-mono-wide">
            <span>★ today you did</span>
            <span className="rounded-md bg-ink px-2 py-0.5 text-[12px] text-bg">
              {wins.length}
            </span>
          </div>
          {wins.slice(0, 8).map((w, i) => (
            <div
              key={w.id}
              className={
                'flex items-center gap-2.5 py-1.5 text-[13.5px] font-medium' +
                (i > 0 ? ' border-t border-dashed border-black/[0.18]' : '')
              }
            >
              <span className="text-[15px]">{glyphFor(w.source_type)}</span>
              <span className="flex-1">{w.text}</span>
              <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
                {formatDistanceToNowStrict(new Date(w.occurred_at), { addSuffix: false })}
              </span>
            </div>
          ))}
        </div>
      )}

      </div>
      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          void reload();
          void reloadWins();
        }}
      />
      <SnoozeSheet
        open={!!snoozePage}
        page={snoozePage}
        onClose={() => setSnoozePage(null)}
        onSnoozed={() => {
          if (snoozePage) skip(snoozePage.id);
          void reload();
        }}
      />
      <BottomNav />
    </div>
  );
}

function glyphFor(t: string) {
  if (t === 'task_completed') return '✓';
  if (t === 'checklist_item') return '·';
  return '★';
}

// ============================================================================
// empty / loading / error / skipped-all states
// ============================================================================

function LoadingState() {
  return (
    <div className="mx-3.5 mb-4 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
      <p className="font-mono text-[12px] uppercase tracking-mono text-ink-soft">
        loading…
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-3.5 mb-4 rounded-[22px] border-2 border-rose-deep bg-rose/30 px-5 py-6 text-center">
      <p className="mb-1 font-serif text-[20px] italic">something didn't load.</p>
      <p className="mb-4 font-mono text-[11px] uppercase tracking-mono text-ink-soft">
        {message.slice(0, 120)}
      </p>
      <button onClick={onRetry} className="btn btn-primary">
        try again
      </button>
    </div>
  );
}

function SkippedAllState({
  totalCount,
  skippedCount,
  onReset,
  onAdd,
  onBoards,
}: {
  totalCount: number;
  skippedCount: number;
  onReset: () => void;
  onAdd: () => void;
  onBoards: () => void;
}) {
  return (
    <div className="mx-3.5 mb-4 rounded-[22px] border-2 border-ink bg-bg-soft px-5 py-7 text-center shadow-card">
      <p className="mb-1 font-serif text-[22px] italic">
        skipped past all {totalCount}.
      </p>
      <p className="mb-4 text-[13px] text-ink-soft">
        you brushed off everything this session. start fresh, add something new,
        or browse the board.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={onReset} className="btn btn-primary">
          ↻ show all again
        </button>
        <button onClick={onAdd} className="btn">+ add a task</button>
        <button onClick={onBoards} className="btn">▦ open board</button>
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-mono text-ink-faint">
        you skipped {skippedCount} in this session
      </p>
    </div>
  );
}

function EmptyState({
  onAdd,
  onBoards,
}: {
  onAdd: () => void;
  onBoards: () => void;
}) {
  return (
    <div className="mx-3.5 mb-4 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
      <p className="mb-1 font-serif text-[22px] italic text-ink-soft">
        nothing to focus on.
      </p>
      <p className="mb-5 text-[13px] text-ink-soft">
        either you've finished everything or there's nothing on your board yet.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={onAdd} className="btn btn-primary">
          + add a task
        </button>
        <button onClick={onBoards} className="btn">
          ▦ open board
        </button>
      </div>
    </div>
  );
}
