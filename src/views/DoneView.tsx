import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';

import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import {
  deletePage,
  getPage,
  listCompletedTasks,
  uncompleteTask,
} from '../lib/db';
import type { Page } from '../lib/types';
import { docToPlaintext, snippet } from '../lib/tiptap';

export default function DoneView() {
  const nav = useNavigate();
  const [tasks, setTasks] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [parents, setParents] = useState<Record<string, Page | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listCompletedTasks();
      setTasks(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // hydrate parent board titles for context labels
  useEffect(() => {
    const want = Array.from(
      new Set(tasks.map((t) => t.parent_id).filter(Boolean) as string[]),
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
  }, [tasks, parents]);

  async function onUndo(task: Page) {
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    try {
      await uncompleteTask(task.id);
    } catch {
      void load();
    }
  }

  async function onDelete(task: Page) {
    if (!window.confirm(`delete "${task.title || 'untitled'}"? can't be undone.`)) return;
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    try {
      await deletePage(task.id);
    } catch {
      void load();
    }
  }

  // group by day for a nicer reading rhythm
  const groups = groupByDay(tasks);

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip right="minimal" />

        <div className="flex items-baseline justify-between px-3.5 pb-3">
          <h1 className="font-serif text-[26px] font-semibold leading-none">
            completed
          </h1>
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            {tasks.length} all-time
          </span>
        </div>

        {loading ? (
          <div className="mx-3.5 mt-6 rounded-[14px] border border-dashed border-ink-faint px-5 py-6 text-center font-mono text-[12px] uppercase tracking-mono text-ink-soft">
            loading…
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="px-3.5">
            {groups.map((g) => (
              <div key={g.dayLabel} className="mb-5">
                <div className="mb-2 px-1 font-mono text-[12px] uppercase tracking-mono-wide text-ink-soft">
                  {g.dayLabel}
                  <span className="ml-2 text-ink-faint">{g.items.length}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {g.items.map((t) => (
                    <DoneRow
                      key={t.id}
                      task={t}
                      parentLabel={parents[t.parent_id ?? '']?.title ?? ''}
                      onOpen={() => nav(`/page/${t.id}`)}
                      onUndo={() => onUndo(t)}
                      onDelete={() => onDelete(t)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function DoneRow({
  task,
  parentLabel,
  onOpen,
  onUndo,
  onDelete,
}: {
  task: Page;
  parentLabel: string;
  onOpen: () => void;
  onUndo: () => void;
  onDelete: () => void;
}) {
  const preview = snippet(docToPlaintext(task.body) || task.body_text || '', 80);
  const completed = task.completed_at ? new Date(task.completed_at) : null;
  return (
    <li className="group flex items-start gap-2.5 rounded-[12px] border-[1.5px] border-ink bg-surface px-3 py-2.5 shadow-card-sm">
      <button
        onClick={onUndo}
        title="undo complete"
        aria-label="undo complete"
        className="mt-0.5 flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-mint-deep text-[12px] font-bold text-ink transition-colors hover:bg-mint"
      >
        ✓
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[14px] font-medium line-through decoration-ink-faint">
          {task.title || 'untitled'}
        </div>
        {(preview || parentLabel) && (
          <div className="mt-0.5 flex items-baseline gap-2 text-[11.5px] text-ink-soft">
            {parentLabel && (
              <span className="font-mono uppercase tracking-mono text-ink-faint">
                {parentLabel}
              </span>
            )}
            {preview && <span className="truncate">{preview}</span>}
          </div>
        )}
      </button>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        {completed && (
          <span className="font-mono text-[10px] uppercase tracking-mono text-ink-soft">
            {formatDistanceToNowStrict(completed, { addSuffix: false })}
          </span>
        )}
        <button
          onClick={onDelete}
          title="delete forever"
          aria-label="delete"
          className={clsx(
            'flex h-[24px] w-[24px] items-center justify-center rounded-md text-[12px] text-ink-soft transition-opacity hover:bg-rose hover:text-ink',
            'md:opacity-0 md:group-hover:opacity-100',
          )}
        >
          ✕
        </button>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mx-3.5 mt-6 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
      <p className="mb-2 font-serif text-[20px] italic text-ink-soft">
        nothing finished yet.
      </p>
      <p className="text-[13px] text-ink-soft">
        completed tasks land here. tap ✓ on any task to test it.
      </p>
    </div>
  );
}

function groupByDay(tasks: Page[]): Array<{ dayLabel: string; items: Page[] }> {
  const buckets = new Map<string, Page[]>();
  for (const t of tasks) {
    if (!t.completed_at) continue;
    const d = new Date(t.completed_at);
    const key = format(d, 'yyyy-MM-dd');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }
  const today = format(new Date(), 'yyyy-MM-dd');
  const yest = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  return Array.from(buckets.entries()).map(([key, items]) => {
    let dayLabel = format(new Date(key), 'EEEE d MMMM').toLowerCase();
    if (key === today) dayLabel = 'today';
    else if (key === yest) dayLabel = 'yesterday';
    return { dayLabel, items };
  });
}
