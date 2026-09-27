import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useBoard } from '../hooks/useBoard';
import BottomNav from '../components/ui/BottomNav';
import CardTile from '../components/board/CardTile';
import CardSheet from '../components/board/CardSheet';
import { supabase } from '../lib/supabase';
import type { Card } from '../lib/board';
import type { Kind } from '../lib/quickAdd';

const SECTIONS: { kind: Kind | 'board'; name: string; empty: string }[] = [
  { kind: 'fix', name: 'to fix', empty: 'nothing broken. say "hub: login is slow" and it lands here.' },
  { kind: 'idea', name: 'ideas', empty: 'ideas you mention land here and never nag.' },
  { kind: 'board', name: 'on the board', empty: 'nothing scheduled for this project.' },
  { kind: 'info', name: 'info', empty: 'reference things: numbers, contacts, how-tos. not passwords.' },
];
const COLORS = ['#e88562', '#a896d4', '#7fb389', '#d48a8a', '#8db4c8', '#e8c75f', '#8a8278', '#d48ab8'];

/** Each project's fixes, ideas and info, filed automatically from anywhere you add. */
export default function ProjectsView() {
  const { data, patch, add, reload } = useBoard();
  const [sel, setSel] = useState<string | null>(() => { try { return localStorage.getItem('projects:sel'); } catch { return null; } });
  const [open, setOpen] = useState<Card | null>(null);
  const projects = (data?.projects ?? []).filter((p) => !p.archived);
  const current = projects.find((p) => p.id === sel) ?? projects[0];
  const cards = useMemo(() => (data?.cards ?? []).filter((c) => c.project_id === current?.id && c.status === 'open'), [data, current?.id]);
  const pick = (id: string) => { setSel(id); try { localStorage.setItem('projects:sel', id); } catch { /* private mode */ } };

  if (!data || !current) return <div className="flex min-h-[100dvh] items-center justify-center font-mono uppercase tracking-mono text-ink-soft">loading…</div>;

  return (
    <div className="min-h-[100dvh] pb-[120px] md:pb-8">
      <header className="px-4 pb-2 pt-4">
        <p className="mono-eyebrow">everything by project</p>
        <h1 className="font-serif text-[28px] font-semibold leading-none">projects</h1>
      </header>
      <nav aria-label="projects" className="sticky top-0 z-30 flex gap-1.5 overflow-x-auto bg-bg/95 px-4 py-2 [scrollbar-width:none]">
        {projects.map((p) => (
          <button key={p.id} onClick={() => pick(p.id)} aria-pressed={p.id === current.id}
            className={clsx('inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-pill border-2 px-3.5 text-[14px] font-semibold',
              p.id === current.id ? 'border-ink bg-surface shadow-card-sm' : 'border-ink/20 bg-surface/60')}>
            <i className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}
          </button>
        ))}
        <NewProject count={projects.length} onMade={reload} />
      </nav>
      <div className="grid grid-cols-1 gap-3.5 px-4 pt-2 md:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map((s) => {
          const list = cards.filter((c) => (s.kind === 'board' ? c.lane !== null && c.kind !== 'info' : c.kind === s.kind && c.lane === null)).sort((a, b) => a.position - b.position);
          return (
            <section key={s.kind} className="flex flex-col gap-2 rounded-[18px] border-2 border-ink bg-bg-soft p-3 shadow-card-sm">
              <h2 className="font-mono text-[18px] uppercase tracking-mono">{s.name}</h2>
              {list.map((c) => (
                <CardTile key={c.id} card={c} projects={projects} hideProject onOpen={() => setOpen(c)} onTick={() => patch(c.id, { status: 'done' })} />
              ))}
              {list.length === 0 && <p className="px-0.5 text-[13px] text-ink-soft">{s.empty}</p>}
              {s.kind !== 'board' && (
                <InlineAdd label={`add to ${s.name}`} onAdd={(t) => add({ title: t, kind: s.kind as Kind, project_id: current.id, lane: null, origin: 'app' })} />
              )}
            </section>
          );
        })}
      </div>
      <CardSheet card={open} projects={projects} goals={data.goals} onClose={() => setOpen(null)} onPatch={(f) => { if (open) { patch(open.id, f); setOpen({ ...open, ...f }); } }} />
      <BottomNav />
    </div>
  );
}

function InlineAdd({ label, onAdd }: { label: string; onAdd: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onAdd(t.trim()); setT(''); } }}>
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder={`+ ${label.replace('add to ', '')}`} aria-label={label} enterKeyHint="send"
        className="min-h-[44px] w-full rounded-[12px] border-[1.5px] border-dashed border-ink/40 bg-transparent px-3 text-[16px] outline-none" />
    </form>
  );
}

function NewProject({ count, onMade }: { count: number; onMade: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="min-h-[42px] shrink-0 rounded-pill border-2 border-dashed border-ink/40 px-3.5 text-[14px] font-semibold text-ink-soft">+ project</button>;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20);
    if (!/^[a-z]/.test(slug)) { setErr('start with a letter'); return; }
    const { error } = await supabase.from('projects').insert({ slug, name: n.slice(0, 40), color: COLORS[count % COLORS.length], sort: count + 1 });
    if (error) { setErr(error.message.includes('duplicate') ? 'you already have that one' : 'did not save'); return; }
    setOpen(false); setName(''); onMade();
  };
  return (
    <form onSubmit={save} className="flex shrink-0 items-center gap-1">
      <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="name" aria-label="new project name"
        className="min-h-[42px] w-[140px] rounded-pill border-2 border-ink bg-surface px-3 text-[16px] outline-none" />
      <button className="btn min-h-[42px] py-1">add</button>
      {err && <span className="text-[12px] text-ink-soft">{err}</span>}
    </form>
  );
}
