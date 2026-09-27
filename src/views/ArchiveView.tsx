import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BottomNav from '../components/ui/BottomNav';
import CardTile from '../components/board/CardTile';
import { loadArchive, type Card, type Project } from '../lib/board';
import { supabase } from '../lib/supabase';

/** What got done, a column per day. Built by itself, never something to process. */
export default function ArchiveView() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    loadArchive(45).then(setCards).catch(() => setCards([]));
    supabase.from('projects').select('id,slug,name,color,aliases,place,sort,archived').then(({ data }) => setProjects((data ?? []) as Project[]));
  }, []);
  const days = new Map<string, Card[]>();
  for (const c of cards ?? []) days.set(c.done_on!, [...(days.get(c.done_on!) ?? []), c]);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).toLowerCase();
  return (
    <div className="min-h-[100dvh] pb-[120px] md:pb-8">
      <header className="flex items-end justify-between px-4 pb-3 pt-4">
        <div>
          <p className="mono-eyebrow">last six weeks</p>
          <h1 className="font-serif text-[28px] font-semibold leading-none">done log</h1>
        </div>
        <Link to="/day" className="pill-action">← my day</Link>
      </header>
      {cards === null && <p className="px-4 font-mono uppercase tracking-mono text-ink-soft">loading…</p>}
      {cards?.length === 0 && <p className="px-4 text-ink-soft">nothing ticked off yet. it fills itself as you go.</p>}
      <div className="flex flex-col gap-3.5 px-4 md:flex-row md:items-start md:overflow-x-auto">
        {[...days].map(([d, list]) => (
          <section key={d} className="flex flex-col gap-2 rounded-[18px] border-2 border-ink bg-bg-soft p-3 shadow-card-sm md:w-[300px] md:shrink-0">
            <h2 className="flex items-baseline justify-between font-mono text-[17px] uppercase tracking-mono">
              {label(d)}<span className="text-ink-soft">{list.length}</span>
            </h2>
            {list.map((c) => <CardTile key={c.id} card={c} projects={projects} />)}
          </section>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
