import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import clsx from 'clsx';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import { getJournalBoardId } from '../lib/journalSnaps';
import { completeTask, listBoardTasks } from '../lib/db';
import type { Page, TaskProperties } from '../lib/types';

/**
 * Front door, post-pivot. Shows what's poking today, what's coming up,
 * and loose ends — all sourced from the hidden journal board's children.
 * Empty state nudges toward snapping a page.
 */
export default function TodayView() {
  const [tasks, setTasks] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [noBoard, setNoBoard] = useState(false);

  const reload = useCallback(async () => {
    try {
      const boardId = await getJournalBoardId();
      if (!boardId) {
        setNoBoard(true);
        setTasks([]);
        return;
      }
      setNoBoard(false);
      const rows = await listBoardTasks(boardId);
      setTasks(rows.filter((t) => !t.completed_at));
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groups = useMemo(() => groupByDue(tasks), [tasks]);
  const hasAny =
    groups.todayPokes.length + groups.upcoming.length + groups.looseEnds.length > 0;

  async function onComplete(p: Page) {
    setTasks((cur) => cur.filter((t) => t.id !== p.id));
    try {
      await completeTask(p.id, p.title);
    } catch {
      void reload();
    }
  }

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip />

        <div className="flex items-baseline justify-between px-3.5 pb-3">
          <h1 className="font-serif text-[26px] font-semibold leading-none">today</h1>
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            {groups.todayPokes.length} poking
          </span>
        </div>

        {loading ? (
          <p className="px-3.5 font-mono text-[11px] uppercase tracking-mono text-ink-faint">
            loading…
          </p>
        ) : !hasAny ? (
          <EmptyState noBoard={noBoard} />
        ) : (
          <div className="space-y-6 px-3.5">
            {groups.todayPokes.length > 0 && (
              <Section title="today">
                {groups.todayPokes.map((p) => (
                  <TaskRow key={p.id} page={p} onComplete={onComplete} dueTone="today" />
                ))}
              </Section>
            )}
            {groups.upcoming.length > 0 && (
              <Section title="next 7 days">
                {groups.upcoming.map((p) => (
                  <TaskRow key={p.id} page={p} onComplete={onComplete} dueTone="upcoming" />
                ))}
              </Section>
            )}
            {groups.looseEnds.length > 0 && (
              <Section title="loose ends">
                {groups.looseEnds.map((p) => (
                  <TaskRow key={p.id} page={p} onComplete={onComplete} dueTone="loose" />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

// ----------------------------------------------------------------------------
// grouping
// ----------------------------------------------------------------------------

interface Groups {
  todayPokes: Page[];   // due_at on or before today
  upcoming: Page[];     // due_at in next 7 days
  looseEnds: Page[];    // no due_at
}

/** props on extracted tasks; due_date is the journal-pivot's date-only field. */
type ExtractedProps = TaskProperties & { due_date?: string };

function effectiveDate(props: ExtractedProps): Date | null {
  if (props.due_at) {
    const d = new Date(props.due_at);
    return isNaN(d.getTime()) ? null : d;
  }
  if (props.due_date) {
    // interpret as local-midnight that day so day comparisons work
    const [y, m, d] = props.due_date.split('-').map((s) => parseInt(s, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return null;
}

function groupByDue(tasks: Page[]): Groups {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const todayPokes: Page[] = [];
  const upcoming: Page[] = [];
  const looseEnds: Page[] = [];

  for (const t of tasks) {
    const props = (t.properties as ExtractedProps | undefined) ?? {};
    const eff = effectiveDate(props);
    if (!eff) {
      looseEnds.push(t);
    } else if (eff.getTime() <= endOfToday.getTime()) {
      todayPokes.push(t);
    } else if (eff.getTime() <= endOfWeek.getTime()) {
      upcoming.push(t);
    } else {
      upcoming.push(t);
    }
  }

  todayPokes.sort(byDueAsc);
  upcoming.sort(byDueAsc);
  looseEnds.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { todayPokes, upcoming, looseEnds };
}

function byDueAsc(a: Page, b: Page): number {
  const ap = (a.properties as ExtractedProps) ?? {};
  const bp = (b.properties as ExtractedProps) ?? {};
  const ad = ap.due_at ?? ap.due_date ?? '';
  const bd = bp.due_at ?? bp.due_date ?? '';
  return ad < bd ? -1 : ad > bd ? 1 : 0;
}

// ----------------------------------------------------------------------------
// rendering
// ----------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function TaskRow({
  page,
  onComplete,
  dueTone,
}: {
  page: Page;
  onComplete: (p: Page) => void;
  dueTone: 'today' | 'upcoming' | 'loose';
}) {
  const props = (page.properties as ExtractedProps | undefined) ?? {};
  const due = props.due_at ? new Date(props.due_at) : null;
  const dateOnly = !due && props.due_date
    ? (() => {
        const [y, m, d] = props.due_date.split('-').map((s) => parseInt(s, 10));
        return y && m && d ? new Date(y, m - 1, d) : null;
      })()
    : null;
  const now = new Date();

  let dueLabel = '';
  if (due && !isNaN(due.getTime())) {
    if (isSameDay(due, now)) {
      dueLabel = format(due, 'h:mma').toLowerCase();
    } else if (due < now) {
      dueLabel = `from ${format(due, 'EEE d MMM').toLowerCase()}`;
    } else {
      dueLabel = format(due, 'EEE d MMM · h:mma').toLowerCase();
    }
  } else if (dateOnly && !isNaN(dateOnly.getTime())) {
    if (isSameDay(dateOnly, now)) {
      dueLabel = 'today · no time';
    } else if (dateOnly < now) {
      dueLabel = `from ${format(dateOnly, 'EEE d MMM').toLowerCase()}`;
    } else {
      dueLabel = format(dateOnly, 'EEE d MMM').toLowerCase();
    }
  }

  return (
    <div
      className={clsx(
        'group flex items-center gap-3 rounded-[12px] border-2 border-ink px-3 py-2 shadow-card-sm',
        dueTone === 'today' ? 'bg-peach/40' : dueTone === 'upcoming' ? 'bg-surface' : 'bg-bg-soft',
      )}
    >
      <button
        type="button"
        onClick={() => onComplete(page)}
        title="mark done"
        aria-label="mark done"
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface font-mono text-[14px] active:translate-x-[1px] active:translate-y-[1px]"
      >
        <span aria-hidden>✓</span>
      </button>
      <Link to={`/page/${page.id}`} className="flex-1 min-w-0">
        <div className="truncate font-sans text-[15px] font-medium text-ink">
          {page.title || <span className="italic text-ink-faint">untitled</span>}
        </div>
        {dueLabel && (
          <div className="font-mono text-[10px] uppercase tracking-mono text-ink-soft">
            {dueLabel}
          </div>
        )}
      </Link>
    </div>
  );
}

function EmptyState({ noBoard }: { noBoard: boolean }) {
  return (
    <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
      <p className="mb-2 font-serif text-[20px] italic text-ink-soft">
        nothing poking yet.
      </p>
      <p className="mb-5 text-[13px] text-ink-soft">
        {noBoard
          ? "snap a page when you've got something. dated items show up here, loose to-dos pile up below."
          : "everything's clear. nice. snap a page when more lands."}
      </p>
      <Link
        to="/snap"
        className="inline-flex items-center gap-2 rounded-[14px] border-2 border-ink bg-peach-deep px-4 py-2 font-sans text-[14px] font-semibold text-ink shadow-card transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-card-sm"
      >
        <Camera size={18} strokeWidth={2.25} aria-hidden />
        <span>snap a page</span>
      </Link>
    </div>
  );
}
