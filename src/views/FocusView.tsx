import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import { useFocusTask } from '../hooks/useFocusTask';
import { docToPlaintext, snippet } from '../lib/tiptap';
import { completeTask, getPage, getStats } from '../lib/db';
import type { Page } from '../lib/types';
import QuickAddSheet from '../components/page/QuickAddSheet';
import SnoozeSheet from '../components/page/SnoozeSheet';

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
  const [parents, setParents] = useState<Record<string, Page | null>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [snoozePage, setSnoozePage] = useState<Page | null>(null);
  const [doneToday, setDoneToday] = useState<number | null>(null);

  // load parent labels for current + alts (subtle context line)
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

  // quiet 'today' count — refresh when tasks reload
  useEffect(() => {
    void getStats()
      .then((s) => setDoneToday(s.completedToday))
      .catch(() => setDoneToday(null));
  }, [current?.id, totalCount]);

  const startCurrent = useCallback(() => {
    if (current) nav(`/page/${current.id}`);
  }, [current, nav]);

  // body preview (note: subtle, not in a card)
  const preview = current ? snippet(docToPlaintext(current.body), 140) : '';
  const parentLabel = current
    ? (parents[current.parent_id ?? '']?.title || 'inbox').toLowerCase()
    : '';
  const ageLabel = current
    ? formatDistanceToNowStrict(new Date(current.created_at))
    : '';

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-narrow">
        <TopStrip onAdd={() => setAddOpen(true)} onProgress={() => void reload()} />

        {/* today chip — quiet, only visible after at least one win today */}
        {doneToday !== null && doneToday > 0 && (
          <div className="px-5 pb-4 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-ink/20 bg-bg-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
              <span className="text-mint-deep">✓</span> {doneToday} done today
            </span>
          </div>
        )}

        {current ? (
          <Hero
            current={current}
            preview={preview}
            parentLabel={parentLabel}
            ageLabel={ageLabel}
            onOpen={startCurrent}
            onDone={async () => {
              await completeTask(current.id, current.title || 'untitled task');
              skip(current.id);
              void reload();
              void getStats().then((s) => setDoneToday(s.completedToday));
            }}
            onSnooze={() => setSnoozePage(current)}
          />
        ) : loading ? (
          <Quiet message="loading…" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void reload()} />
        ) : skippedCount > 0 && totalCount > 0 ? (
          <SkippedAll
            totalCount={totalCount}
            onReset={resetSkipped}
            onAdd={() => setAddOpen(true)}
          />
        ) : (
          <Empty onAdd={() => setAddOpen(true)} onBoards={() => nav('/boards')} />
        )}

        {alternatives.length > 0 && (
          <div className="mt-8 px-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
                or maybe…
              </span>
              {skippedCount > 0 && (
                <button
                  onClick={resetSkipped}
                  className="font-mono text-[10px] uppercase tracking-mono text-ink-faint underline hover:text-ink-soft"
                >
                  show {skippedCount} skipped
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {alternatives.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/page/${p.id}`}
                    className="group flex items-baseline gap-2 text-left"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
                      {(parents[p.parent_id ?? '']?.title || 'inbox')
                        .toString()
                        .toLowerCase()
                        .slice(0, 16)}
                    </span>
                    <span className="font-serif text-[16px] italic leading-snug text-ink-soft group-hover:text-ink">
                      {p.title || 'untitled'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <QuickAddSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => void reload()}
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
      </div>
      <BottomNav />
    </div>
  );
}

// ============================================================================
// hero — typography-forward, no card chrome
// ============================================================================
function Hero({
  current,
  preview,
  parentLabel,
  ageLabel,
  onOpen,
  onDone,
  onSnooze,
}: {
  current: Page;
  preview: string;
  parentLabel: string;
  ageLabel: string;
  onOpen: () => void;
  onDone: () => void | Promise<void>;
  onSnooze: () => void;
}) {
  return (
    <div className="mx-3.5 mt-8 px-2">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-mono-wide text-ink-faint">
        <span>{parentLabel}</span>
        <span className="mx-2 text-ink-faint/70">·</span>
        <span>started {ageLabel} ago</span>
      </div>

      <h1
        className={clsx(
          'mb-5 font-serif font-semibold leading-[1.1] tracking-[-0.015em] text-ink',
          'text-[34px] sm:text-[40px] md:text-[44px]',
        )}
      >
        {current.title || 'untitled task'}
      </h1>

      {preview && (
        <p className="mb-7 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
          {preview}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-pill border-2 border-ink bg-ink px-5 py-3 font-sans text-[15px] font-bold text-bg shadow-coral active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_var(--peach-deep)]"
        >
          open task <span aria-hidden>→</span>
        </button>
        <button
          onClick={onDone}
          className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline-offset-4 hover:underline hover:text-ink"
        >
          ✓ mark done
        </button>
        <button
          onClick={onSnooze}
          className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline-offset-4 hover:underline hover:text-ink"
        >
          ↻ snooze
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// supporting states — equally typography-forward
// ============================================================================
function Quiet({ message }: { message: string }) {
  return (
    <div className="px-5 py-16 text-center font-mono text-[12px] uppercase tracking-mono text-ink-faint">
      {message}
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-3.5 mt-8 px-2">
      <p className="mb-2 font-serif text-[24px] italic text-ink-soft">
        something didn't load.
      </p>
      <p className="mb-4 font-mono text-[11px] uppercase tracking-mono text-rose-deep">
        {message.slice(0, 120)}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex rounded-pill border-2 border-ink bg-ink px-4 py-2.5 font-sans text-[14px] font-bold text-bg shadow-coral"
      >
        try again
      </button>
    </div>
  );
}

function SkippedAll({
  totalCount,
  onReset,
  onAdd,
}: {
  totalCount: number;
  onReset: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="mx-3.5 mt-8 px-2">
      <p className="mb-2 font-serif text-[26px] italic text-ink-soft">
        skipped past all {totalCount}.
      </p>
      <p className="mb-5 text-[14px] text-ink-soft">
        you brushed off everything this session. start fresh or add something new.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-pill border-2 border-ink bg-ink px-4 py-2.5 font-sans text-[14px] font-bold text-bg shadow-coral"
        >
          ↻ show all again
        </button>
        <button
          onClick={onAdd}
          className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline-offset-4 hover:underline hover:text-ink"
        >
          + add a task
        </button>
      </div>
    </div>
  );
}

function Empty({ onAdd, onBoards }: { onAdd: () => void; onBoards: () => void }) {
  return (
    <div className="mx-3.5 mt-12 px-2">
      <p className="mb-2 font-serif text-[28px] italic text-ink-soft">
        nothing to do.
      </p>
      <p className="mb-6 max-w-[48ch] text-[14px] text-ink-soft">
        nothing's been added, or you've finished everything. enjoy the empty.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-pill border-2 border-ink bg-ink px-4 py-2.5 font-sans text-[14px] font-bold text-bg shadow-coral"
        >
          + add a task
        </button>
        <button
          onClick={onBoards}
          className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline-offset-4 hover:underline hover:text-ink"
        >
          ▦ open board
        </button>
      </div>
    </div>
  );
}
