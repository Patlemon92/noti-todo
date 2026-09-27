import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, pointerWithin,
  useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoard } from '../hooks/useBoard';
import BottomNav from '../components/ui/BottomNav';
import CardSheet from '../components/board/CardSheet';
import CardTile from '../components/board/CardTile';
import RoutinesPanel from '../components/board/RoutinesPanel';
import GoalsPanel from '../components/board/GoalsPanel';
import { LANES, between, createRoutine, laneFor, type Card, type Lane } from '../lib/board';
import { parseQuickAdd } from '../lib/quickAdd';

type Tab = Lane | 'routines' | 'goals';
const TABS: { id: Tab; name: string }[] = [...LANES.map((l) => ({ id: l.id as Tab, name: l.name })), { id: 'routines', name: 'routines' }, { id: 'goals', name: 'goals' }];
const LANE_IDS = LANES.map((l) => l.id);
const isLane = (x: unknown): x is Lane => LANE_IDS.includes(x as Lane);

// A card under the finger wins over the column it sits in (so a drop lands
// where you point); then a column or chip; otherwise the nearest card.
const collide: CollisionDetection = (args) => {
  const inside = pointerWithin(args);
  const cards = inside.filter((c) => typeof c.id === 'number');
  if (cards.length) return cards;
  return inside.length ? inside : closestCenter(args);
};

export default function MyDayView() {
  const { data, error, patch, add, reload, clearError } = useBoard();
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('myday:tab') as Tab) || 'today'; } catch { return 'today'; }
  });
  const [open, setOpen] = useState<Card | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [lanesDuringDrag, setLanesDuringDrag] = useState<Record<Lane, number[]> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem('myday:tab', tab); } catch { /* private mode */ } }, [tab]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 2600); return () => window.clearTimeout(t); }, [toast]);

  const byId = useMemo(() => new Map((data?.cards ?? []).map((c) => [c.id, c])), [data]);
  const projects = data?.projects ?? [];
  const max = data?.maxToday ?? 3;

  // What each lane shows. Today: routines apart, then three, the rest folded.
  const view = useMemo(() => {
    const open = (data?.cards ?? []).filter((c) => c.status === 'open');
    const lanes = {} as Record<Lane, Card[]>;
    for (const l of LANE_IDS) lanes[l] = open.filter((c) => c.lane === l && c.origin !== 'routine').sort((a, b) => a.position - b.position);
    return {
      lanes,
      routinesToday: (data?.cards ?? []).filter((c) => c.origin === 'routine' && c.lane === 'today' && c.status !== 'archived'),
      doneToday: (data?.cards ?? []).filter((c) => c.status === 'done' && c.origin !== 'routine'),
    };
  }, [data]);

  // The ids each lane lets you drag among (today: only the visible ones).
  const sortable = useMemo(() => {
    const out = {} as Record<Lane, number[]>;
    for (const l of LANE_IDS) {
      const list = view.lanes[l];
      out[l] = (l === 'today' && !showWaiting ? list.slice(0, max) : list).map((c) => c.id);
    }
    return out;
  }, [view, showWaiting, max]);
  const lanes = lanesDuringDrag ?? sortable;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const laneOf = (id: string | number, set: Record<Lane, number[]>): Lane | null => {
    if (typeof id === 'string') {
      const k = id.replace(/^(lane|chip):/, '');
      return isLane(k) ? k : null;
    }
    return LANE_IDS.find((l) => set[l].includes(id)) ?? null;
  };

  function onDragStart(e: DragStartEvent) {
    setDragId(Number(e.active.id));
    setLanesDuringDrag(sortable);
  }
  function onDragOver(e: DragOverEvent) {
    if (!e.over || !lanesDuringDrag) return;
    const id = Number(e.active.id);
    const from = laneOf(id, lanesDuringDrag);
    const to = laneOf(e.over.id, lanesDuringDrag);
    if (!from || !to || from === to || String(e.over.id).startsWith('chip:')) return;
    setLanesDuringDrag((cur) => {
      if (!cur) return cur;
      const next = { ...cur, [from]: cur[from].filter((x) => x !== id) };
      const at = typeof e.over!.id === 'number' ? next[to].indexOf(e.over!.id as number) : next[to].length;
      next[to] = [...next[to].slice(0, at < 0 ? next[to].length : at), id, ...next[to].slice(at < 0 ? next[to].length : at)];
      return next;
    });
  }
  function onDragEnd(e: DragEndEvent) {
    const id = Number(e.active.id);
    const cur = lanesDuringDrag;
    setDragId(null);
    setLanesDuringDrag(null);
    if (!e.over || !cur) return;
    const card = byId.get(id);
    if (!card) return;
    // Dropped on a lane chip (phone): to the end of that lane.
    if (String(e.over.id).startsWith('chip:')) {
      const to = String(e.over.id).slice(5) as Lane;
      if (to === card.lane) return;
      const last = view.lanes[to].at(-1);
      patch(id, { lane: to, position: between(last?.position, undefined) });
      setToast(`moved to ${LANES.find((l) => l.id === to)!.name}`);
      return;
    }
    const to = laneOf(e.over.id, cur);
    if (!to) return;
    let ids = cur[to];
    // Dropped on a card: it goes above that card if you let go over its top
    // half, below if over its bottom half. Decided from where it was let go,
    // not from the order shuffled during the drag, so it lands where you point.
    if (typeof e.over.id === 'number' && e.over.id !== id) {
      const act = e.active.rect.current.translated;
      const below = !!act && act.top + act.height / 2 > e.over.rect.top + e.over.rect.height / 2;
      ids = ids.filter((x) => x !== id);
      const at = ids.indexOf(e.over.id as number);
      ids.splice(at < 0 ? ids.length : at + (below ? 1 : 0), 0, id);
    }
    // You put it in Today, so you see it: if it would land past the three
    // that show, it takes the last visible place and that card folds instead.
    if (to === 'today' && !showWaiting && ids.indexOf(id) >= max) {
      ids = ids.filter((x) => x !== id);
      ids.splice(max - 1, 0, id);
    }
    const i = ids.indexOf(id);
    // Today's folded cards sit after the visible ones: the card goes before them.
    const folded = view.lanes[to].filter((c) => c.id !== id && !ids.includes(c.id));
    const next = byId.get(ids[i + 1]) ?? (i === ids.length - 1 ? folded[0] : undefined);
    const pos = between(byId.get(ids[i - 1])?.position, next?.position);
    if (to === card.lane && Math.abs(pos - card.position) < 1e-9) return;
    patch(id, { lane: to, position: pos });
  }

  const tick = (c: Card) => patch(c.id, { status: c.status === 'done' ? 'open' : 'done', done_on: c.status === 'done' ? null : c.done_on });

  async function quickAdd(text: string, lane?: Lane) {
    const p = parseQuickAdd(text, projects);
    if (p.routine) {
      try {
        await createRoutine({ title: p.title, rule: p.routine, project_id: p.projectId, tags: p.tags });
        setToast(`routine added: ${p.title.toLowerCase()}`);
        reload();
      } catch { setToast('that routine did not save'); }
      return;
    }
    const kind = p.kind ?? 'task';
    // A fix with a date goes on the board for that day too; undated fixes and ideas live in their project.
    const datedFix = kind === 'fix' && p.dueDate ? laneFor(p.dueDate) : undefined;
    const onBoard = kind === 'task' || kind === 'reminder' || lane || datedFix;
    await add({
      title: p.title, kind, project_id: p.projectId, tags: p.tags, due_date: p.dueDate, due_time: p.dueTime,
      ...(lane ? { lane } : datedFix ? { lane: datedFix } : {}), origin: 'app',
    });
    if (!onBoard) setToast(`${kind === 'idea' ? 'idea' : kind === 'fix' ? 'fix' : 'saved'} filed in ${projects.find((x) => x.id === p.projectId)?.name.toLowerCase() ?? 'projects'}`);
  }

  const dragging = dragId !== null ? byId.get(dragId) : null;

  if (!data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <span className="font-mono text-sm uppercase tracking-mono text-ink-soft">{error ?? 'loading…'}</span>
      </div>
    );
  }

  const laneColumn = (l: Lane) => (
    <LaneColumn
      key={l}
      lane={l}
      cards={lanes[l].map((id) => byId.get(id)!).filter(Boolean)}
      waiting={l === 'today' ? view.lanes.today.length - max : 0}
      showWaiting={showWaiting}
      onToggleWaiting={() => setShowWaiting((s) => !s)}
      routines={l === 'today' ? view.routinesToday : []}
      done={view.doneToday.filter((c) => c.lane === l)}
      projects={projects}
      onOpen={setOpen}
      onTick={tick}
      onAdd={(t) => quickAdd(t, l)}
    />
  );

  return (
    <div className="flex min-h-[100dvh] flex-col pb-[150px] md:pb-6">
      <header className="flex items-end justify-between gap-3 px-4 pb-2 pt-4">
        <div>
          <p className="mono-eyebrow">{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' }).toUpperCase()}</p>
          <h1 className="font-serif text-[28px] font-semibold leading-none">my day</h1>
        </div>
        <a href="/archive" className="pill-action">done log</a>
      </header>

      {/* Desktop and iPad: add at the top. Phone: docked above the nav, in thumb reach. */}
      <div className="hidden px-4 pb-3 md:block"><AddBar onAdd={(t) => quickAdd(t)} /></div>

      {error && (
        <button onClick={clearError} className="mx-4 mb-2 rounded-[12px] border-2 border-ink bg-rose px-3 py-2 text-left text-[13px] font-semibold">
          {error} · tap to dismiss
        </button>
      )}

      <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragId(null); setLanesDuringDrag(null); }}>
        {/* Phone: one lane at a time; the chips are also drop targets. */}
        <nav aria-label="lanes" className="sticky top-0 z-30 flex gap-1.5 overflow-x-auto bg-bg/95 px-4 py-2 [scrollbar-width:none] md:hidden">
          {TABS.map((t) => <LaneChip key={t.id} tab={t} active={tab === t.id} dragging={dragId !== null} onClick={() => setTab(t.id)} />)}
        </nav>
        <div className="px-4 md:hidden">
          {isLane(tab) ? laneColumn(tab) : tab === 'routines'
            ? <RoutinesPanel routines={data.routines} projects={projects} onChanged={reload} />
            : <GoalsPanel goals={data.goals} onChanged={reload} />}
        </div>

        {/* iPad and desktop: every lane side by side, like Trello. */}
        <div className="hidden flex-1 items-start gap-3.5 overflow-x-auto px-4 pb-4 md:flex">
          {LANE_IDS.map(laneColumn)}
          <section className="w-[300px] shrink-0 rounded-[18px] border-2 border-ink bg-bg-soft p-3 shadow-card-sm">
            <RoutinesPanel routines={data.routines} projects={projects} onChanged={reload} />
          </section>
          <section className="w-[280px] shrink-0 rounded-[18px] border-2 border-ink bg-bg-soft p-3 shadow-card-sm">
            <GoalsPanel goals={data.goals} onChanged={reload} />
          </section>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && <div className="rotate-[1.5deg]"><CardTile card={dragging} projects={projects} lifted /></div>}
        </DragOverlay>
      </DndContext>

      <div className="fixed inset-x-3 z-40 md:hidden" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}>
        <AddBar onAdd={(t) => quickAdd(t)} />
      </div>

      {toast && (
        <div role="status" className="fixed bottom-[150px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-pill border-2 border-ink bg-ink px-4 py-2 text-[13.5px] font-semibold text-bg shadow-card-sm md:bottom-6">
          {toast}
        </div>
      )}

      <CardSheet card={open} projects={projects} goals={data.goals} onClose={() => setOpen(null)} onPatch={(f) => { if (open) { patch(open.id, f); setOpen({ ...open, ...f }); } }} />
      <BottomNav />
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────── */

function AddBar({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText('');
    ref.current?.focus();
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-[18px] border-2 border-ink bg-surface p-1.5 shadow-card">
      <label htmlFor="myday-add" className="sr-only">add anything</label>
      <input
        id="myday-add" ref={ref} value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="send" autoComplete="off"
        placeholder="add anything… hub: fix login friday"
        className="min-h-[44px] min-w-0 flex-1 bg-transparent px-2.5 text-[16px] outline-none placeholder:text-ink-faint"
      />
      <button type="submit" aria-label="add" className="h-[44px] w-[44px] shrink-0 rounded-[13px] border-2 border-ink bg-peach-deep text-[22px] font-bold leading-none text-ink">+</button>
    </form>
  );
}

function LaneChip({ tab, active, dragging, onClick }: { tab: { id: Tab; name: string }; active: boolean; dragging: boolean; onClick: () => void }) {
  const drop = useDroppable({ id: `chip:${tab.id}`, disabled: !isLane(tab.id) });
  return (
    <button
      ref={drop.setNodeRef} onClick={onClick} aria-pressed={active}
      className={clsx(
        'min-h-[40px] shrink-0 rounded-pill border-2 px-3.5 font-mono text-[15px] uppercase tracking-mono transition-colors',
        active ? 'border-ink bg-ink text-bg' : 'border-ink/25 bg-surface text-ink',
        dragging && isLane(tab.id) && 'border-dashed border-ink',
        drop.isOver && 'border-solid border-ink bg-peach-deep text-ink',
      )}
    >
      {tab.name}
    </button>
  );
}

interface LaneProps {
  lane: Lane;
  cards: Card[];
  waiting: number;
  showWaiting: boolean;
  onToggleWaiting: () => void;
  routines: Card[];
  done: Card[];
  projects: Parameters<typeof CardTile>[0]['projects'];
  onOpen: (c: Card) => void;
  onTick: (c: Card) => void;
  onAdd: (text: string) => void;
}

function LaneColumn({ lane, cards, waiting, showWaiting, onToggleWaiting, routines, done, projects, onOpen, onTick, onAdd }: LaneProps) {
  const meta = LANES.find((l) => l.id === lane)!;
  const drop = useDroppable({ id: `lane:${lane}` });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  return (
    <section
      ref={drop.setNodeRef}
      aria-label={meta.name}
      className={clsx(
        'flex flex-col gap-2 md:max-h-[calc(100dvh-170px)] md:w-[300px] md:shrink-0 md:overflow-y-auto md:rounded-[18px] md:border-2 md:border-ink md:p-3 md:shadow-card-sm',
        lane === 'today' ? 'md:bg-peach' : 'md:bg-bg-soft',
        drop.isOver && 'md:outline md:outline-2 md:outline-offset-2 md:outline-peach-deep',
      )}
    >
      <div className="hidden items-baseline justify-between md:flex">
        <h2 className="font-mono text-[18px] uppercase tracking-mono">{meta.name}</h2>
      </div>
      <p className="px-0.5 text-[12.5px] text-ink-soft">{meta.hint}</p>

      {routines.length > 0 && (
        <div className="rounded-[14px] border-[1.5px] border-dashed border-ink/40 bg-surface/60 p-2">
          <p className="mono-eyebrow mb-1 px-1">routines</p>
          {routines.map((r) => (
            <button key={r.id} onClick={() => onTick(r)} className="flex min-h-[40px] w-full items-center gap-2.5 rounded-[10px] px-1 text-left">
              <span className={clsx('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-ink text-[12px]', r.status === 'done' && 'bg-mint-deep')}>{r.status === 'done' ? '✓' : ''}</span>
              <span className={clsx('text-[14.5px]', r.status === 'done' && 'text-ink-soft line-through')}>{r.title}</span>
            </button>
          ))}
        </div>
      )}

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map((c) => <SortableCard key={c.id} card={c} projects={projects} onOpen={onOpen} onTick={onTick} />)}
      </SortableContext>
      {cards.length === 0 && routines.length === 0 && (
        <p className="rounded-[14px] border-[1.5px] border-dashed border-ink/30 px-3 py-5 text-center text-[13.5px] text-ink-soft">
          {lane === 'today' ? 'nothing today. enjoy it, or drag something here.' : 'empty.'}
        </p>
      )}

      {waiting > 0 && (
        <button onClick={onToggleWaiting} className="min-h-[40px] px-1 text-left text-[13.5px] font-semibold text-ink-soft">
          {showWaiting ? 'fold them away ▴' : `${waiting} more can wait ▾`}
        </button>
      )}

      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(''); } }} className="flex gap-1.5">
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (!text.trim()) setAdding(false); }}
            aria-label={`add to ${meta.name}`} placeholder={`add to ${meta.name}…`} enterKeyHint="send"
            className="min-h-[44px] min-w-0 flex-1 rounded-[12px] border-2 border-ink bg-surface px-3 text-[16px] outline-none" />
          <button type="submit" className="btn px-3">add</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="min-h-[40px] rounded-[12px] px-2 text-left text-[14px] font-semibold text-ink-soft hover:bg-surface/70">+ add</button>
      )}

      {done.length > 0 && (
        <div className="mt-1 flex flex-col gap-1.5 opacity-70">
          <p className="mono-eyebrow px-1">done today</p>
          {done.map((c) => <CardTile key={c.id} card={c} projects={projects} onOpen={() => onOpen(c)} onTick={() => onTick(c)} />)}
        </div>
      )}
    </section>
  );
}

function SortableCard({ card, projects, onOpen, onTick }: { card: Card; projects: LaneProps['projects']; onOpen: (c: Card) => void; onTick: (c: Card) => void }) {
  const s = useSortable({ id: card.id });
  return (
    <div
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className={clsx('touch-manipulation', s.isDragging && 'opacity-30')}
      {...s.attributes}
      {...s.listeners}
    >
      <CardTile card={card} projects={projects} onOpen={() => onOpen(card)} onTick={() => onTick(card)} />
    </div>
  );
}
