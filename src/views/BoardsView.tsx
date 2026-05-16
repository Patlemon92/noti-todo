import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import clsx from 'clsx';

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

const COLOR_BG: Record<PastelColor, string> = {
  peach: 'bg-peach',
  butter: 'bg-butter',
  mint: 'bg-mint',
  lavender: 'bg-lavender',
  sky: 'bg-sky',
  rose: 'bg-rose',
};

const STATUS_FROM_COLUMN: Record<string, TaskStatus> = {
  today: 'today',
  doing: 'doing',
  waiting: 'waiting',
  done: 'done',
};

export default function BoardsView() {
  const nav = useNavigate();
  const [boards, setBoards] = useState<Page[]>([]);
  const [active, setActive] = useState<Page | null>(null);
  const [tasks, setTasks] = useState<Page[]>([]);
  const [switcher, setSwitcher] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  // ----- loaders -----
  async function loadBoards() {
    let list = await listBoards();
    if (list.length === 0) {
      const def = await getDefaultBoard();
      list = def ? [def] : [];
    }
    setBoards(list);
    setActive((cur) => (cur ? list.find((b) => b.id === cur.id) ?? list[0] : list[0]));
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

  // ----- column model -----
  const columns: BoardColumn[] =
    (active?.properties as BoardProperties | undefined)?.columns ??
    DEFAULT_BOARD_COLUMNS;

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
    byColumn[colId].sort(
      (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    );
  }

  // ----- dnd -----
  const sensors = useSensors(
    // Pointer: 8px movement before drag starts so a quick tap is still a tap.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Touch: 200ms hold to start dragging on mobile.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const draggedTask = dragId ? tasks.find((t) => t.id === dragId) ?? null : null;

  async function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    setOverColumn(null);
    const taskId = String(e.active.id);
    const targetColumn = e.over ? String(e.over.id).replace(/^col:/, '') : null;
    if (!targetColumn) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const props = (task.properties as TaskProperties | undefined) ?? {};
    const currentColumn = props.column_id ?? props.status;
    if (currentColumn === targetColumn) return;

    // optimistic UI
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId
          ? ({
              ...t,
              properties: {
                ...((t.properties as TaskProperties | undefined) ?? {}),
                status: STATUS_FROM_COLUMN[targetColumn],
                column_id: targetColumn,
              },
              completed_at: targetColumn === 'done' ? new Date().toISOString() : null,
            } as Page)
          : t,
      ),
    );

    try {
      await updatePage(taskId, {
        properties: {
          ...props,
          status: STATUS_FROM_COLUMN[targetColumn],
          column_id: targetColumn,
        } as TaskProperties,
        completed_at: targetColumn === 'done' ? new Date().toISOString() : null,
      });
    } catch {
      // on failure, refetch to revert
      if (active) await loadTasks(active.id);
    }
  }

  // ----- rename -----
  async function renameBoard(boardId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    // optimistic
    setBoards((cur) => cur.map((b) => (b.id === boardId ? { ...b, title: trimmed } : b)));
    if (active?.id === boardId) setActive({ ...active, title: trimmed });
    await updatePage(boardId, { title: trimmed });
  }

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <TopStrip right="minimal" />

      {/* board title — click to edit, ▾ opens switcher */}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={clsx(
              'block h-[12px] w-[12px] flex-shrink-0 rounded-full border-[1.5px] border-ink',
              COLOR_BG[(active?.properties as BoardProperties | undefined)?.color ?? 'sky'],
            )}
          />
          {active && (
            <InlineRename
              key={active.id}
              value={active.title}
              onSave={(v) => renameBoard(active.id, v)}
            />
          )}
        </div>
        <button
          onClick={() => setSwitcher(true)}
          aria-label="switch board"
          className="icon-btn font-mono text-[14px]"
        >
          ▾
        </button>
      </div>

      <div className="px-3.5 pb-2">
        <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
          {tasks.length} task{tasks.length === 1 ? '' : 's'}
          {dragId && ' · drop into a column'}
        </span>
      </div>

      {active && (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
          onDragOver={(e) =>
            setOverColumn(e.over ? String(e.over.id).replace(/^col:/, '') : null)
          }
          onDragCancel={() => {
            setDragId(null);
            setOverColumn(null);
          }}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto px-3.5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {columns.map((col) => (
              <Column
                key={col.id}
                col={col}
                tasks={byColumn[col.id] ?? []}
                isOver={overColumn === col.id}
                hasDrag={!!dragId}
                draggingId={dragId}
                onOpen={(id) => nav(`/page/${id}`)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {draggedTask ? <DraggingCard task={draggedTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <Sheet
        open={switcher}
        onClose={() => setSwitcher(false)}
        title="boards"
        subtitle="rename inline. new boards land in stage 3."
      >
        <div className="flex flex-col gap-1.5">
          {boards.map((b) => (
            <div
              key={b.id}
              className={clsx(
                'flex items-center gap-2.5 rounded-[12px] border-[1.5px] px-3 py-2.5',
                active?.id === b.id
                  ? 'border-ink bg-bg-soft shadow-card-sm'
                  : 'border-ink-faint',
              )}
            >
              <button
                onClick={() => {
                  setActive(b);
                  setSwitcher(false);
                }}
                className="flex flex-1 items-center gap-2.5 text-left"
              >
                <span
                  className={clsx(
                    'block h-[10px] w-[10px] flex-shrink-0 rounded-full border-[1.5px] border-ink',
                    COLOR_BG[(b.properties as BoardProperties | undefined)?.color ?? 'sky'],
                  )}
                />
                <span className="text-[14px] font-medium">{b.title || 'untitled'}</span>
              </button>
              <InlineRename
                value={b.title}
                onSave={(v) => renameBoard(b.id, v)}
                compact
              />
            </div>
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

// ============================================================================
// inline-editable text — click reveals input, blur/enter saves
// ============================================================================
function InlineRename({
  value,
  onSave,
  compact = false,
}: {
  value: string;
  onSave: (v: string) => void | Promise<void>;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) void onSave(draft.trim());
    else setDraft(value);
  }

  if (compact) {
    return (
      <button
        onClick={() => setEditing(true)}
        aria-label="rename"
        className="rounded-md border border-transparent px-1.5 py-1 font-mono text-[11px] uppercase tracking-mono text-ink-soft hover:border-ink-faint"
      >
        {editing ? 'saving…' : 'rename'}
        {editing && (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(value);
                setEditing(false);
              }
            }}
            className="absolute left-3.5 right-3.5 rounded-md border-2 border-ink bg-surface px-2 py-1 text-[14px] outline-none"
          />
        )}
      </button>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 rounded-[10px] border-2 border-ink bg-surface px-2 py-1 font-serif text-[22px] font-semibold leading-tight outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex min-w-0 flex-1 items-baseline gap-2 text-left"
      title="click to rename"
    >
      <h1 className="truncate font-serif text-[22px] font-semibold leading-none">
        {value || 'untitled board'}
      </h1>
      <span className="font-mono text-[11px] uppercase tracking-mono text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
        ✎
      </span>
    </button>
  );
}

// ============================================================================
// droppable column
// ============================================================================
function Column({
  col,
  tasks,
  isOver,
  hasDrag,
  draggingId,
  onOpen,
}: {
  col: BoardColumn;
  tasks: Page[];
  isOver: boolean;
  hasDrag: boolean;
  draggingId: string | null;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col:${col.id}` });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex w-[260px] flex-shrink-0 flex-col rounded-[14px] border-2 bg-surface shadow-card transition-[background-color,border-color,box-shadow]',
        isOver
          ? 'border-coral shadow-coral bg-peach/30'
          : 'border-ink',
      )}
    >
      <div
        className={clsx(
          'flex items-center justify-between rounded-t-[12px] border-b-[1.5px] border-ink px-3 py-2 font-mono text-[12px] uppercase tracking-mono-wide transition-colors',
          COLOR_BG[col.color],
        )}
      >
        <span className="flex items-center gap-1.5">
          {col.name}
          {isOver && <span className="text-coral">→ drop here</span>}
        </span>
        <span className="text-ink-soft">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-2 min-h-[80px]">
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            dragging={draggingId === t.id}
            onOpen={() => onOpen(t.id)}
          />
        ))}
        {tasks.length === 0 && (
          <div
            className={clsx(
              'rounded-[10px] border border-dashed py-3 text-center text-[12.5px] italic transition-colors',
              isOver
                ? 'border-coral text-coral'
                : hasDrag
                  ? 'border-ink-faint text-ink-soft'
                  : 'border-transparent text-ink-faint',
            )}
          >
            {isOver ? 'release to drop' : 'empty'}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// draggable card
// ============================================================================
function Card({
  task,
  dragging,
  onOpen,
}: {
  task: Page;
  dragging: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id });
  const preview = snippet(docToPlaintext(task.body) || task.body_text || '', 60);

  // We let dnd-kit's PointerSensor handle drag detection via its
  // distance/delay activation constraints. A tap that doesn't move enough to
  // start a drag fires our onClick → navigate.
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (dragging) {
          e.preventDefault();
          return;
        }
        onOpen();
      }}
      role="button"
      tabIndex={0}
      className={clsx(
        'cursor-grab touch-none select-none rounded-[10px] border-[1.5px] border-ink bg-bg-soft px-2.5 py-2 text-[13.5px] leading-snug shadow-card-sm transition-opacity active:cursor-grabbing',
        dragging && 'opacity-30',
      )}
    >
      <div className="font-medium">{task.title || 'untitled'}</div>
      {preview && <div className="mt-0.5 text-[12px] text-ink-soft">{preview}</div>}
    </div>
  );
}

// ============================================================================
// the "ghost" that follows the pointer while dragging
// ============================================================================
function DraggingCard({ task }: { task: Page }) {
  const preview = snippet(docToPlaintext(task.body) || task.body_text || '', 60);
  return (
    <div className="w-[244px] rotate-[-2deg] rounded-[10px] border-2 border-ink bg-surface px-2.5 py-2 text-[13.5px] leading-snug shadow-[6px_6px_0_var(--ink)]">
      <div className="font-medium">{task.title || 'untitled'}</div>
      {preview && <div className="mt-0.5 text-[12px] text-ink-soft">{preview}</div>}
    </div>
  );
}

