import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import Sheet from '../components/ui/Sheet';
import {
  getDefaultBoard,
  listBoardTasks,
  listBoards,
  updatePage,
} from '../lib/db';
import type {
  BoardColumn,
  BoardProperties,
  Page,
  PastelColor,
  TaskProperties,
  TaskStatus,
} from '../lib/types';
import { DEFAULT_BOARD_COLUMNS } from '../lib/types';
import { docToPlaintext, snippet } from '../lib/tiptap';
import clsx from 'clsx';

const COLOR_BG: Record<PastelColor, string> = {
  peach: 'bg-peach',
  butter: 'bg-butter',
  mint: 'bg-mint',
  lavender: 'bg-lavender',
  sky: 'bg-sky',
  rose: 'bg-rose',
};

const STATUS_ORDER: TaskStatus[] = ['today', 'doing', 'waiting', 'done'];

export default function BoardsView() {
  const [boards, setBoards] = useState<Page[]>([]);
  const [active, setActive] = useState<Page | null>(null);
  const [tasks, setTasks] = useState<Page[]>([]);
  const [switcher, setSwitcher] = useState(false);

  async function loadBoards() {
    let list = await listBoards();
    if (list.length === 0) {
      // shouldn't happen — signup trigger creates one — but be defensive
      const def = await getDefaultBoard();
      list = def ? [def] : [];
    }
    setBoards(list);
    setActive(list[0] ?? null);
  }

  async function loadTasks(boardId: string) {
    const rows = await listBoardTasks(boardId);
    setTasks(rows);
  }

  useEffect(() => {
    void loadBoards();
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadTasks(active.id);
  }, [active]);

  const columns: BoardColumn[] = ((active?.properties as BoardProperties | undefined)?.columns
    ?? DEFAULT_BOARD_COLUMNS);

  const byColumn: Record<string, Page[]> = {};
  for (const col of columns) byColumn[col.id] = [];
  for (const t of tasks) {
    const props = (t.properties as TaskProperties | undefined) ?? {};
    const colId =
      props.column_id ?? props.status ?? (t.completed_at ? 'done' : 'today');
    if (!byColumn[colId]) byColumn[colId] = [];
    byColumn[colId].push(t);
  }
  for (const colId in byColumn) {
    byColumn[colId].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  }

  async function cycleStatus(task: Page) {
    const props = (task.properties as TaskProperties | undefined) ?? {};
    const cur = (props.status ?? props.column_id ?? 'today') as TaskStatus;
    const idx = STATUS_ORDER.indexOf(cur);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    await updatePage(task.id, {
      properties: { ...props, status: next, column_id: next } as TaskProperties,
      completed_at: next === 'done' ? new Date().toISOString() : null,
    });
    if (active) await loadTasks(active.id);
  }

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <TopStrip right="minimal" />

      <div className="flex items-center justify-between px-3.5 pb-3">
        <button
          onClick={() => setSwitcher(true)}
          className="flex items-center gap-2 rounded-pill border-[1.5px] border-ink bg-surface px-3 py-1.5 text-[13px] font-medium shadow-card-sm"
        >
          <span
            className={clsx(
              'block h-[10px] w-[10px] rounded-full border-[1.5px] border-ink',
              COLOR_BG[(active?.properties as BoardProperties | undefined)?.color ?? 'sky'],
            )}
          />
          {active?.title || 'board'}
          <span className="font-mono text-[12px] text-ink-soft">▾</span>
        </button>
        <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
          {tasks.length} tasks
        </span>
      </div>

      {active && (
        <div className="flex gap-3 overflow-x-auto px-3.5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {columns.map((col) => (
            <div
              key={col.id}
              className="flex w-[260px] flex-shrink-0 flex-col rounded-[14px] border-2 border-ink bg-surface shadow-card"
            >
              <div
                className={clsx(
                  'flex items-center justify-between rounded-t-[12px] border-b-[1.5px] border-ink px-3 py-2 font-mono text-[12px] uppercase tracking-mono-wide',
                  COLOR_BG[col.color],
                )}
              >
                <span>{col.name}</span>
                <span className="text-ink-soft">{byColumn[col.id]?.length ?? 0}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {(byColumn[col.id] ?? []).map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onLongPress={() => void cycleStatus(t)}
                  />
                ))}
                {(byColumn[col.id] ?? []).length === 0 && (
                  <div className="px-1 py-2 text-[12.5px] italic text-ink-faint">
                    empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={switcher}
        onClose={() => setSwitcher(false)}
        title="boards"
        subtitle="multi-board lands in stage 3."
      >
        <div className="flex flex-col gap-1.5">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setActive(b);
                setSwitcher(false);
              }}
              className={clsx(
                'flex items-center gap-2.5 rounded-[12px] border-[1.5px] px-3 py-2.5 text-left',
                active?.id === b.id
                  ? 'border-ink bg-bg-soft shadow-card-sm'
                  : 'border-ink-faint',
              )}
            >
              <span
                className={clsx(
                  'block h-[10px] w-[10px] rounded-full border-[1.5px] border-ink',
                  COLOR_BG[(b.properties as BoardProperties | undefined)?.color ?? 'sky'],
                )}
              />
              <span className="text-[14px] font-medium">{b.title}</span>
            </button>
          ))}
          <button
            disabled
            className="flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-ink-faint px-3 py-2.5 text-left text-[14px] text-ink-faint"
          >
            + new board (stage 3)
          </button>
        </div>
      </Sheet>

      <BottomNav />
    </div>
  );
}

function TaskCard({
  task,
  onLongPress,
}: {
  task: Page;
  onLongPress: () => void;
}) {
  const preview = snippet(docToPlaintext(task.body) || task.body_text || '', 60);
  let pressTimer: number | null = null;
  let didLong = false;

  function start() {
    didLong = false;
    pressTimer = window.setTimeout(() => {
      didLong = true;
      onLongPress();
    }, 500);
  }
  function end() {
    if (pressTimer) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  return (
    <Link
      to={`/page/${task.id}`}
      onClick={(e) => {
        if (didLong) e.preventDefault();
      }}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      className="block rounded-[10px] border-[1.5px] border-ink bg-bg-soft px-2.5 py-2 text-[13.5px] leading-snug shadow-card-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
    >
      <div className="font-medium">{task.title || 'untitled'}</div>
      {preview && (
        <div className="mt-0.5 text-[12px] text-ink-soft">{preview}</div>
      )}
    </Link>
  );
}
