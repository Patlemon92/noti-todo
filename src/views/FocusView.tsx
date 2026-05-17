import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import clsx from 'clsx';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import { useFocusTask } from '../hooks/useFocusTask';
import { useAuth } from '../hooks/useAuth';
import { docToPlaintext, snippet } from '../lib/tiptap';
import {
  completeTask,
  createPage,
  getDefaultBoard,
  getMyProfile,
  getPage,
  getStats,
  listCompletedTasks,
} from '../lib/db';
import type { Page } from '../lib/types';
import QuickAddSheet from '../components/page/QuickAddSheet';
import SnoozeSheet from '../components/page/SnoozeSheet';

export default function FocusView() {
  const nav = useNavigate();
  const { user } = useAuth();
  const {
    current,
    alternatives,
    totalCount,
    skippedCount,
    skip,
    resetSkipped,
    reload,
  } = useFocusTask();
  const [parents, setParents] = useState<Record<string, Page | null>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [snoozePage, setSnoozePage] = useState<Page | null>(null);
  const [doneToday, setDoneToday] = useState<Page[]>([]);
  const [openCount, setOpenCount] = useState<number>(0);
  const [profileName, setProfileName] = useState<string>('');

  // active tasks: hero + alternatives in one ordered list
  const activeTasks: Page[] = useMemo(
    () => (current ? [current, ...alternatives] : alternatives),
    [current, alternatives],
  );

  // hydrate parents for every visible task (active + done today)
  useEffect(() => {
    const targets = [...activeTasks, ...doneToday];
    const want = Array.from(
      new Set(targets.map((t) => t.parent_id).filter(Boolean) as string[]),
    );
    const missing = want.filter((id) => !(id in parents));
    if (missing.length === 0) return;
    void Promise.all(missing.map((id) => getPage(id).then((p) => [id, p] as const))).then(
      (rows) => {
        setParents((cur) => {
          const next = { ...cur };
          for (const [id, p] of rows) next[id] = p;
          return next;
        });
      },
    );
  }, [activeTasks, doneToday, parents]);

  // load done-today + stats
  const loadDay = useCallback(async () => {
    const [stats, completed] = await Promise.all([
      getStats().catch(() => null),
      listCompletedTasks(50).catch(() => [] as Page[]),
    ]);
    if (stats) setOpenCount(stats.openTasks);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    setDoneToday(
      completed.filter((p) => p.completed_at && new Date(p.completed_at) >= startOfDay),
    );
  }, []);

  useEffect(() => {
    void loadDay();
  }, [loadDay, totalCount]);

  // tab visibility refresh — for the day summary too
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') void loadDay();
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadDay]);

  // profile display name
  useEffect(() => {
    let active = true;
    getMyProfile()
      .then((p) => {
        if (!active) return;
        setProfileName(p?.display_name?.trim() || (user?.email?.split('@')[0] ?? ''));
      })
      .catch(() => {
        if (active && user?.email) setProfileName(user.email.split('@')[0]);
      });
    return () => {
      active = false;
    };
  }, [user?.email]);

  // quick add to 'today' on the default board
  async function quickAddToday(title: string) {
    const board = await getDefaultBoard();
    await createPage({
      type: 'task',
      title,
      parent_id: board?.id ?? null,
      properties: { status: 'today', column_id: 'today' },
    });
    void reload();
    void loadDay();
  }

  const greeting = greetingFor(new Date());
  const dateLabel = format(new Date(), 'EEEE d MMMM').toLowerCase();

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-narrow">
        <TopStrip onAdd={() => setAddOpen(true)} onProgress={() => {
          void reload();
          void loadDay();
        }} />

        {/* greeting */}
        <div className="px-5 pb-6 pt-2">
          <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-[-0.01em] sm:text-[34px]">
            {greeting}{profileName ? `, ${profileName.toLowerCase()}` : ''}.
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-mono text-ink-faint">
            {dateLabel}
          </p>
        </div>

        {/* overview line */}
        <div className="mb-3 flex items-baseline gap-2 px-5 font-mono text-[11px] uppercase tracking-mono text-ink-soft">
          <span>{openCount} open</span>
          <span className="text-ink-faint">·</span>
          <span>
            {doneToday.length} done today
          </span>
          {skippedCount > 0 && (
            <>
              <span className="text-ink-faint">·</span>
              <button
                onClick={resetSkipped}
                className="underline-offset-4 hover:underline hover:text-ink"
              >
                {skippedCount} skipped
              </button>
            </>
          )}
        </div>

        {/* today's tasks */}
        <section className="px-3.5">
          <SectionLabel label="today" count={activeTasks.length} />
          <div className="mt-2 flex flex-col gap-1.5">
            {activeTasks.length === 0 ? (
              <EmptyToday onAdd={() => setAddOpen(true)} onBoards={() => nav('/boards')} />
            ) : (
              activeTasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  primary={i === 0}
                  parentLabel={
                    (parents[task.parent_id ?? '']?.title || 'inbox').toLowerCase()
                  }
                  onOpen={() => nav(`/page/${task.id}`)}
                  onDone={async () => {
                    await completeTask(task.id, task.title || 'untitled task');
                    skip(task.id);
                    void reload();
                    void loadDay();
                  }}
                  onSnooze={() => setSnoozePage(task)}
                />
              ))
            )}
            <QuickAddRow onAdd={quickAddToday} />
          </div>
        </section>

        {/* done today */}
        {doneToday.length > 0 && (
          <section className="mt-8 px-3.5">
            <SectionLabel label="done today" count={doneToday.length} />
            <ul className="mt-2 flex flex-col gap-1">
              {doneToday.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <Link
                    to={`/page/${task.id}`}
                    className="group flex items-baseline gap-2 px-2 py-1 text-left"
                  >
                    <span className="text-mint-deep">✓</span>
                    <span className="flex-1 truncate text-[14px] text-ink-soft line-through decoration-ink-faint group-hover:text-ink">
                      {task.title || 'untitled'}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
                      {(parents[task.parent_id ?? '']?.title || 'inbox').toLowerCase()}
                    </span>
                  </Link>
                </li>
              ))}
              {doneToday.length > 8 && (
                <li>
                  <Link
                    to="/done"
                    className="px-2 font-mono text-[10px] uppercase tracking-mono text-ink-faint underline-offset-4 hover:underline hover:text-ink-soft"
                  >
                    + {doneToday.length - 8} more in /done
                  </Link>
                </li>
              )}
            </ul>
          </section>
        )}

        {/* calendar placeholder — google calendar integration coming next */}
        <section className="mt-8 px-3.5">
          <SectionLabel label="calendar" />
          <div className="mt-2 rounded-[10px] border border-dashed border-ink-faint bg-bg-soft px-4 py-3 text-[12.5px] leading-snug text-ink-soft">
            google calendar comes next. once connected, your events will sit
            alongside today's tasks here.
          </div>
        </section>

        <QuickAddSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            void reload();
            void loadDay();
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
      </div>
      <BottomNav />
    </div>
  );
}

// ============================================================================
// pieces
// ============================================================================

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-1.5 px-2 font-mono text-[10px] uppercase tracking-mono-wide text-ink-faint">
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="text-ink-soft">{count}</span>
      )}
    </div>
  );
}

function TaskRow({
  task,
  primary,
  parentLabel,
  onOpen,
  onDone,
  onSnooze,
}: {
  task: Page;
  primary: boolean;
  parentLabel: string;
  onOpen: () => void;
  onDone: () => void | Promise<void>;
  onSnooze: () => void;
}) {
  const preview = primary ? snippet(docToPlaintext(task.body), 110) : '';
  return (
    <div
      className={clsx(
        'group flex items-start gap-2 rounded-[10px] px-2 py-2 transition-colors',
        primary
          ? 'border-[1.5px] border-ink bg-surface shadow-card-sm'
          : 'border border-transparent hover:bg-bg-soft',
      )}
    >
      <button
        onClick={onDone}
        title="mark done"
        aria-label="mark done"
        className={clsx(
          'mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink/50 bg-surface text-[10px] font-bold text-ink-soft transition-colors hover:border-ink hover:bg-mint hover:text-ink',
        )}
      >
        <span className="opacity-0 group-hover:opacity-100">✓</span>
      </button>
      <button
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className={clsx('truncate text-ink', primary ? 'font-serif text-[20px] font-semibold leading-tight' : 'text-[14px] font-medium')}>
          {task.title || 'untitled'}
        </div>
        {primary && preview && (
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">{preview}</p>
        )}
        <div className={clsx('mt-1 font-mono uppercase tracking-mono text-ink-faint', primary ? 'text-[10px]' : 'text-[9.5px]')}>
          {parentLabel}
        </div>
      </button>
      {primary && (
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <button
            onClick={onOpen}
            className="rounded-pill border-2 border-ink bg-ink px-3 py-1 font-sans text-[11px] font-bold text-bg shadow-coral active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_var(--peach-deep)]"
          >
            open →
          </button>
          <button
            onClick={onSnooze}
            className="font-mono text-[9px] uppercase tracking-mono text-ink-soft hover:text-ink"
          >
            ↻ snooze
          </button>
        </div>
      )}
    </div>
  );
}

function QuickAddRow({ onAdd }: { onAdd: (title: string) => void | Promise<void> }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        void onAdd(t);
        setText('');
      }}
      className="flex items-center gap-2 rounded-[10px] border border-dashed border-ink-faint px-2 py-1.5 transition-colors focus-within:border-ink"
    >
      <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-ink-faint text-[12px] text-ink-faint">
        +
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="quick add to today…"
        className="min-w-0 flex-1 border-none bg-transparent text-[14px] outline-none placeholder:text-ink-faint"
      />
    </form>
  );
}

function EmptyToday({ onAdd, onBoards }: { onAdd: () => void; onBoards: () => void }) {
  return (
    <div className="rounded-[12px] border border-dashed border-ink-faint bg-bg-soft px-4 py-5 text-center">
      <p className="mb-2 font-serif text-[18px] italic text-ink-soft">
        nothing to do.
      </p>
      <p className="mb-4 text-[12.5px] text-ink-soft">
        clean slate. add something below or browse your boards.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={onAdd}
          className="rounded-pill border-2 border-ink bg-ink px-3 py-1.5 font-sans text-[12px] font-bold text-bg shadow-coral"
        >
          + add a task
        </button>
        <button
          onClick={onBoards}
          className="rounded-pill border border-ink bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-mono"
        >
          open boards
        </button>
      </div>
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'still up';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'late one';
}
