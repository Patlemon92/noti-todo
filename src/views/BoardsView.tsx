import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';

import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import Sheet from '../components/ui/Sheet';
import QuickAddSheet from '../components/page/QuickAddSheet';
import {
  createPage,
  getDefaultBoard,
  listBoardTasks,
  listBoards,
  updatePage,
} from '../lib/db';
import { supabase } from '../lib/supabase';
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

// ============================================================================
// palette helpers
// ============================================================================
const COLOR_BG: Record<PastelColor, string> = {
  peach: 'bg-peach',
  butter: 'bg-butter',
  mint: 'bg-mint',
  lavender: 'bg-lavender',
  sky: 'bg-sky',
  rose: 'bg-rose',
};

const COLOR_DOT: Record<PastelColor, string> = {
  peach: 'bg-peach-deep',
  butter: 'bg-butter-deep',
  mint: 'bg-mint-deep',
  lavender: 'bg-lavender-deep',
  sky: 'bg-sky-deep',
  rose: 'bg-rose-deep',
};

const PALETTE: PastelColor[] = ['peach', 'butter', 'mint', 'lavender', 'sky', 'rose'];

function makeId() {
  return (
    crypto.randomUUID?.() ??
    'col_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

// ============================================================================
// component
// ============================================================================
export default function BoardsView() {
  const nav = useNavigate();
  const [boards, setBoards] = useState<Page[]>([]);
  const [active, setActive] = useState<Page | null>(null);
  const [tasks, setTasks] = useState<Page[]>([]);
  const [switcher, setSwitcher] = useState(false);

  // dnd state
  const [dragKind, setDragKind] = useState<'task' | 'column' | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  // per-column menu state
  const [menuColumnId, setMenuColumnId] = useState<string | null>(null);

  // global add sheet
  const [addOpen, setAddOpen] = useState(false);

  // ----- loaders -----
  async function loadBoards() {
    let list = await listBoards();
    if (list.length === 0) {
      const def = await getDefaultBoard();
      list = def ? [def] : [];
    }
    setBoards(list);
    setActive((cur) =>
      cur ? list.find((b) => b.id === cur.id) ?? list[0] : list[0],
    );
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

  const menuColumn = columns.find((c) => c.id === menuColumnId) ?? null;

  // ----- dnd -----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (tasks.some((t) => t.id === id)) {
      setDragKind('task');
      setDragId(id);
    } else if (columns.some((c) => c.id === id)) {
      setDragKind('column');
      setDragId(id);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    const kind = dragKind;
    setDragKind(null);
    setDragId(null);
    setOverColumn(null);
    if (!overId || activeId === overId) return;

    if (kind === 'task') {
      await moveTask(activeId, overId);
    } else if (kind === 'column') {
      await reorderColumns(activeId, overId);
    }
  }

  async function moveTask(taskId: string, targetColumnId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const props = (task.properties as TaskProperties | undefined) ?? {};
    const currentColumn = props.column_id ?? props.status;
    if (currentColumn === targetColumnId) return;

    // optimistic
    setTasks((cur) =>
      cur.map((t) =>
        t.id === taskId
          ? ({
              ...t,
              properties: {
                ...((t.properties as TaskProperties | undefined) ?? {}),
                status: (targetColumnId as TaskStatus) ?? props.status,
                column_id: targetColumnId,
              },
              completed_at:
                targetColumnId === 'done' ? new Date().toISOString() : null,
            } as Page)
          : t,
      ),
    );

    try {
      await updatePage(taskId, {
        properties: {
          ...props,
          status: (targetColumnId as TaskStatus) ?? props.status,
          column_id: targetColumnId,
        } as TaskProperties,
        completed_at:
          targetColumnId === 'done' ? new Date().toISOString() : null,
      });
    } catch {
      if (active) await loadTasks(active.id);
    }
  }

  async function reorderColumns(activeId: string, overId: string) {
    if (!active) return;
    const oldIndex = columns.findIndex((c) => c.id === activeId);
    const newIndex = columns.findIndex((c) => c.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const moved = arrayMove(columns, oldIndex, newIndex).map((c, i) => ({
      ...c,
      sort_order: i,
    }));
    await saveColumns(moved);
  }

  // ----- column ops -----
  async function saveColumns(next: BoardColumn[]) {
    if (!active) return;
    const props = (active.properties as BoardProperties | undefined) ?? {};
    const nextProps: BoardProperties = { ...props, columns: next };
    const updatedBoard = { ...active, properties: nextProps } as Page;
    setActive(updatedBoard);
    setBoards((cur) => cur.map((b) => (b.id === active.id ? updatedBoard : b)));
    await updatePage(active.id, { properties: nextProps });
  }

  async function renameBoard(boardId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setBoards((cur) => cur.map((b) => (b.id === boardId ? { ...b, title: trimmed } : b)));
    if (active?.id === boardId) setActive({ ...active, title: trimmed });
    await updatePage(boardId, { title: trimmed });
  }

  async function renameColumn(columnId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = columns.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c));
    await saveColumns(next);
  }

  async function setColumnColor(columnId: string, color: PastelColor) {
    const next = columns.map((c) => (c.id === columnId ? { ...c, color } : c));
    await saveColumns(next);
  }

  async function addColumn(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (columns.length >= 8) return;
    // pick a color not already in heavy use; fallback to next palette index
    const inUse = new Set(columns.map((c) => c.color));
    const nextColor = PALETTE.find((p) => !inUse.has(p)) ?? PALETTE[columns.length % PALETTE.length];
    const next = [
      ...columns,
      {
        id: makeId(),
        name: trimmed,
        color: nextColor,
        sort_order: columns.length,
      } as BoardColumn,
    ];
    await saveColumns(next);
  }

  /** Delete a column. If it has tasks, they're moved to `moveTo` first. */
  async function addTaskToColumn(columnId: string, title: string) {
    if (!active) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const isDefault = ['today', 'doing', 'waiting', 'done'].includes(columnId);
    const existing = byColumn[columnId] ?? [];
    const sortOrder = existing.length;
    await createPage({
      type: 'task',
      title: trimmed,
      parent_id: active.id,
      properties: {
        column_id: columnId,
        ...(isDefault ? { status: columnId as TaskStatus } : {}),
      },
      sort_order: sortOrder,
    });
    await loadTasks(active.id);
  }

  async function deleteColumn(columnId: string, moveTo?: string) {
    if (!active) return;
    if (columns.length <= 1) return; // keep at least one
    const tasksInColumn = byColumn[columnId] ?? [];

    // 1. move tasks if needed
    if (tasksInColumn.length > 0) {
      if (!moveTo) return;
      // optimistic local
      setTasks((cur) =>
        cur.map((t) =>
          tasksInColumn.find((x) => x.id === t.id)
            ? ({
                ...t,
                properties: {
                  ...((t.properties as TaskProperties | undefined) ?? {}),
                  status: moveTo as TaskStatus,
                  column_id: moveTo,
                },
                completed_at:
                  moveTo === 'done' ? new Date().toISOString() : t.completed_at,
              } as Page)
            : t,
        ),
      );
      // bulk update via supabase: for each task, update its properties
      const updates = tasksInColumn.map((t) => {
        const props = (t.properties as TaskProperties | undefined) ?? {};
        return supabase
          .from('pages')
          .update({
            properties: {
              ...props,
              status: moveTo as TaskStatus,
              column_id: moveTo,
            },
            completed_at:
              moveTo === 'done' ? new Date().toISOString() : null,
          })
          .eq('id', t.id);
      });
      await Promise.all(updates);
    }

    // 2. drop the column
    const next = columns
      .filter((c) => c.id !== columnId)
      .map((c, i) => ({ ...c, sort_order: i }));
    await saveColumns(next);
  }

  const draggedTask = dragKind === 'task' && dragId
    ? tasks.find((t) => t.id === dragId) ?? null
    : null;
  const draggedColumn = dragKind === 'column' && dragId
    ? columns.find((c) => c.id === dragId) ?? null
    : null;

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-wide">
      <TopStrip onAdd={() => setAddOpen(true)} />

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
          {dragKind === 'task' && ' · drop into a column'}
          {dragKind === 'column' && ' · drag to reorder'}
        </span>
      </div>

      {active && (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragOver={(e) => {
            if (dragKind !== 'task') return;
            const overId = e.over ? String(e.over.id) : null;
            setOverColumn(overId);
          }}
          onDragCancel={() => {
            setDragKind(null);
            setDragId(null);
            setOverColumn(null);
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-3 overflow-x-auto px-3.5 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {columns.map((col) => (
                <SortableColumn
                  key={col.id}
                  col={col}
                  tasks={byColumn[col.id] ?? []}
                  isOver={overColumn === col.id && dragKind === 'task'}
                  hasTaskDrag={dragKind === 'task'}
                  hasColumnDrag={dragKind === 'column'}
                  draggingTaskId={dragKind === 'task' ? dragId : null}
                  onOpen={(id) => nav(`/page/${id}`)}
                  onRename={(name) => renameColumn(col.id, name)}
                  onOpenMenu={() => setMenuColumnId(col.id)}
                  onAddTask={(title) => addTaskToColumn(col.id, title)}
                />
              ))}
              <AddColumnButton onAdd={addColumn} disabled={columns.length >= 8} />
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {draggedTask ? (
              <DraggingCard task={draggedTask} />
            ) : draggedColumn ? (
              <DraggingColumn col={draggedColumn} count={byColumn[draggedColumn.id]?.length ?? 0} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* per-column menu — color + delete */}
      <ColumnMenuSheet
        column={menuColumn}
        otherColumns={columns.filter((c) => c.id !== menuColumnId)}
        taskCount={menuColumnId ? (byColumn[menuColumnId]?.length ?? 0) : 0}
        canDelete={columns.length > 1}
        onClose={() => setMenuColumnId(null)}
        onColor={(color) => menuColumnId && setColumnColor(menuColumnId, color)}
        onDelete={(moveTo) => {
          if (menuColumnId) {
            void deleteColumn(menuColumnId, moveTo);
          }
          setMenuColumnId(null);
        }}
      />

      <Sheet
        open={switcher}
        onClose={() => setSwitcher(false)}
        title="boards"
        subtitle="multi-board lands in stage 3. for now: rename inline below."
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

      </div>
      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => active && void loadTasks(active.id)}
      />
      <BottomNav />
    </div>
  );
}

// ============================================================================
// inline-editable text — board title
// ============================================================================
function InlineRename({
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
// sortable column — drag handle + droppable for cards + inline rename + ⋯ menu
// ============================================================================
function SortableColumn({
  col,
  tasks,
  isOver,
  hasTaskDrag,
  hasColumnDrag,
  draggingTaskId,
  onOpen,
  onRename,
  onOpenMenu,
  onAddTask,
}: {
  col: BoardColumn;
  tasks: Page[];
  isOver: boolean;
  hasTaskDrag: boolean;
  hasColumnDrag: boolean;
  draggingTaskId: string | null;
  onOpen: (id: string) => void;
  onRename: (name: string) => void | Promise<void>;
  onOpenMenu: () => void;
  onAddTask: (title: string) => void | Promise<void>;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'flex w-[260px] flex-shrink-0 flex-col rounded-[14px] border-2 bg-surface shadow-card transition-[background-color,border-color,box-shadow]',
        isDragging && 'opacity-30',
        isOver
          ? 'border-coral shadow-coral bg-peach/30'
          : 'border-ink',
      )}
    >
      <div
        className={clsx(
          'flex items-center gap-1.5 rounded-t-[12px] border-b-[1.5px] border-ink px-2 py-1.5 font-mono text-[12px] uppercase tracking-mono-wide transition-colors',
          COLOR_BG[col.color],
        )}
      >
        {/* drag handle */}
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label="drag column"
          title="drag to reorder"
          className="flex h-6 w-5 cursor-grab items-center justify-center text-[14px] leading-none text-ink-soft hover:text-ink active:cursor-grabbing"
        >
          ⋮⋮
        </button>

        {/* editable name */}
        <ColumnNameEditor name={col.name} onSave={onRename} />

        {/* count + menu */}
        <div className="flex items-center gap-1">
          {isOver && <span className="text-coral">→ drop</span>}
          <span className="text-ink-soft">{tasks.length}</span>
          <button
            onClick={onOpenMenu}
            aria-label="column options"
            title="color · delete"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[14px] text-ink-soft hover:bg-ink/10 hover:text-ink"
          >
            ⋯
          </button>
        </div>
      </div>

      <div className="flex min-h-[80px] flex-col gap-1.5 p-2">
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            dragging={draggingTaskId === t.id}
            onOpen={() => onOpen(t.id)}
          />
        ))}
        {tasks.length === 0 && !isOver && (
          <div
            className={clsx(
              'rounded-[10px] border border-dashed py-2.5 text-center text-[12.5px] italic transition-colors',
              hasTaskDrag
                ? 'border-ink-faint text-ink-soft'
                : 'border-transparent text-ink-faint',
            )}
          >
            empty
          </div>
        )}
        {isOver && (
          <div className="rounded-[10px] border border-dashed border-coral py-2.5 text-center text-[12.5px] italic text-coral">
            release to drop
          </div>
        )}
        <AddTaskInline onAdd={onAddTask} />
      </div>
    </div>
  );
}

// ============================================================================
// "+ add task" inline input — sits at the bottom of every column
// ============================================================================
function AddTaskInline({
  onAdd,
}: {
  onAdd: (title: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit(stayOpen = false) {
    if (draft.trim()) void onAdd(draft.trim());
    setDraft('');
    if (!stayOpen) setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-[10px] border-[1.5px] border-dashed border-ink bg-bg-soft p-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // shift+enter keeps the input open so you can add several in a row
              commit(e.shiftKey);
            }
            if (e.key === 'Escape') {
              setDraft('');
              setEditing(false);
            }
          }}
          placeholder="task title…"
          maxLength={140}
          className="w-full rounded-md border-none bg-transparent px-2 py-1 text-[13.5px] outline-none placeholder:text-ink-faint"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-transparent py-1.5 font-mono text-[11px] uppercase tracking-mono text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-soft"
    >
      <span className="text-[13px]">+</span> add task
    </button>
  );
}

// ============================================================================
// click-to-edit column name
// ============================================================================
function ColumnNameEditor({
  name,
  onSave,
}: {
  name: string;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) void onSave(draft.trim());
    else setDraft(name);
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
            setDraft(name);
            setEditing(false);
          }
        }}
        maxLength={24}
        className="min-w-0 flex-1 rounded-md border border-ink bg-surface px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-mono-wide outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="rename column"
      className="group flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
    >
      <span className="truncate">{name || 'untitled'}</span>
      <span className="text-[11px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
        ✎
      </span>
    </button>
  );
}

// ============================================================================
// "+ add column" affordance at the end of the row
// ============================================================================
function AddColumnButton({
  onAdd,
  disabled,
}: {
  onAdd: (name: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    if (draft.trim()) void onAdd(draft.trim());
    setDraft('');
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex w-[200px] flex-shrink-0 items-center gap-1.5 self-start rounded-[14px] border-2 border-dashed border-ink bg-bg-soft p-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft('');
              setEditing(false);
            }
          }}
          maxLength={24}
          placeholder="column name"
          className="min-w-0 flex-1 rounded-md border border-ink bg-surface px-2 py-1 text-[13px] outline-none placeholder:text-ink-faint"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      title={disabled ? 'max 8 columns' : 'add column'}
      className="flex w-[160px] flex-shrink-0 items-center justify-center gap-1.5 self-start rounded-[14px] border-2 border-dashed border-ink-faint bg-transparent py-3 font-mono text-[12px] uppercase tracking-mono text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="text-[16px] leading-none">+</span> add column
    </button>
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
// drag overlays
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

function DraggingColumn({ col, count }: { col: BoardColumn; count: number }) {
  return (
    <div className="w-[260px] rotate-[-1.5deg] overflow-hidden rounded-[14px] border-2 border-ink bg-surface shadow-[6px_6px_0_var(--ink)]">
      <div
        className={clsx(
          'flex items-center justify-between border-b-[1.5px] border-ink px-3 py-1.5 font-mono text-[12px] uppercase tracking-mono-wide',
          COLOR_BG[col.color],
        )}
      >
        <span>{col.name}</span>
        <span className="text-ink-soft">{count}</span>
      </div>
      <div className="px-3 py-3 text-[12.5px] italic text-ink-soft">
        {count} task{count === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// ============================================================================
// per-column menu sheet — color picker + delete (with "move tasks to" picker)
// ============================================================================
function ColumnMenuSheet({
  column,
  otherColumns,
  taskCount,
  canDelete,
  onClose,
  onColor,
  onDelete,
}: {
  column: BoardColumn | null;
  otherColumns: BoardColumn[];
  taskCount: number;
  canDelete: boolean;
  onClose: () => void;
  onColor: (c: PastelColor) => void;
  onDelete: (moveTo?: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);

  useEffect(() => {
    if (column) {
      setConfirmDelete(false);
      setMoveTo(otherColumns[0]?.id ?? null);
    }
  }, [column?.id, otherColumns]);

  if (!column) return null;

  return (
    <Sheet
      open={!!column}
      onClose={onClose}
      title={column.name}
      subtitle={confirmDelete ? 'this can\'t be undone.' : 'color · delete'}
    >
      {!confirmDelete && (
        <>
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
            color
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => onColor(c)}
                aria-label={`set ${c}`}
                className={clsx(
                  'flex h-12 w-12 items-center justify-center rounded-full border-2 transition-transform active:scale-95',
                  column.color === c ? 'border-ink shadow-card-sm' : 'border-ink-faint',
                  COLOR_BG[c],
                )}
              >
                {column.color === c && (
                  <span className="text-[12px] font-bold text-ink">✓</span>
                )}
              </button>
            ))}
          </div>

          <button
            disabled={!canDelete}
            onClick={() => setConfirmDelete(true)}
            className="w-full rounded-[12px] border-2 border-rose-deep bg-rose/30 px-3 py-2.5 text-[14px] font-semibold text-ink shadow-card-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            title={!canDelete ? 'a board needs at least one column' : undefined}
          >
            delete column
          </button>
          {!canDelete && (
            <p className="mt-2 text-center text-[12px] italic text-ink-soft">
              you need at least one column.
            </p>
          )}
        </>
      )}

      {confirmDelete && (
        <>
          {taskCount > 0 ? (
            <>
              <p className="mb-3 text-[14px] leading-snug">
                <em className="italic">{column.name}</em> has{' '}
                <strong>{taskCount}</strong> task{taskCount === 1 ? '' : 's'}.
                where should they go?
              </p>
              <div className="mb-4 flex flex-col gap-1.5">
                {otherColumns.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setMoveTo(c.id)}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left',
                      moveTo === c.id
                        ? 'border-ink bg-bg-soft shadow-card-sm'
                        : 'border-ink-faint',
                    )}
                  >
                    <span
                      className={clsx(
                        'block h-[10px] w-[10px] flex-shrink-0 rounded-full border-[1.5px] border-ink',
                        COLOR_DOT[c.color],
                      )}
                    />
                    <span className="text-[14px] font-medium">{c.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mb-4 text-[14px]">
              <em className="italic">{column.name}</em> is empty. delete it?
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="btn flex-1"
            >
              cancel
            </button>
            <button
              onClick={() => onDelete(taskCount > 0 ? moveTo ?? undefined : undefined)}
              disabled={taskCount > 0 && !moveTo}
              className="flex-1 rounded-[14px] border-2 border-ink bg-rose-deep px-3 py-2.5 text-[14px] font-bold text-bg shadow-card-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
            >
              delete
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
