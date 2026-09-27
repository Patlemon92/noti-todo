import { useState } from 'react';
import clsx from 'clsx';
import { createRoutine, deleteRoutine, ruleWords, updateRoutine, type Project, type Routine } from '../../lib/board';

const ORDER = ['daily', 'weekdays', 'weekly:1', 'weekly:2', 'weekly:3', 'weekly:4', 'weekly:5', 'weekly:6', 'weekly:0'];
const rank = (r: string) => (ORDER.includes(r) ? ORDER.indexOf(r) : 100 + Number(r.split(':')[1] ?? 0));
const RULES: [string, string][] = [['daily', 'every day'], ['weekdays', 'weekdays'], ...['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d, i): [string, string] => [`weekly:${(i + 1) % 7}`, `${d}days`]), ['monthly', 'a day each month']];

/** The checks that come round by themselves. Each morning today's appear in Today. */
export default function RoutinesPanel({ routines, projects, onChanged }: { routines: Routine[]; projects: Project[]; onChanged: () => void }) {
  const [title, setTitle] = useState('');
  const [rule, setRule] = useState('daily');
  const [dom, setDom] = useState(1);
  const [project, setProject] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const groups = new Map<string, Routine[]>();
  for (const r of [...routines].sort((a, b) => rank(a.rule) - rank(b.rule) || a.sort - b.sort)) {
    groups.set(r.rule, [...(groups.get(r.rule) ?? []), r]);
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createRoutine({ title: title.trim(), rule: rule === 'monthly' ? `monthly:${dom}` : rule, project_id: project || null });
    setTitle('');
    onChanged();
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="hidden font-mono text-[18px] uppercase tracking-mono md:block">routines</h2>
        <p className="text-[12.5px] text-ink-soft">today's appear in today each morning. unticked ones just go at midnight.</p>
      </div>
      {[...groups].map(([r, list]) => (
        <div key={r}>
          <p className="mono-eyebrow mb-1">{ruleWords(r)}</p>
          <div className="flex flex-col gap-1.5">
            {list.map((x) => (
              <div key={x.id} className={clsx('flex items-center gap-2 rounded-[12px] border-2 border-ink bg-surface px-2.5 py-2 shadow-card-sm', !x.active && 'opacity-50')}>
                {x.project_id && <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: projects.find((p) => p.id === x.project_id)?.color }} />}
                <span className="min-w-0 flex-1 break-words text-[14.5px]">{x.title}</span>
                <button className="min-h-[36px] rounded-[8px] px-2 text-[12.5px] font-semibold text-ink-soft" onClick={async () => { await updateRoutine(x.id, { active: !x.active }); onChanged(); }}>
                  {x.active ? 'pause' : 'resume'}
                </button>
                {confirm === x.id
                  ? <button className="min-h-[36px] rounded-[8px] bg-rose px-2 text-[12.5px] font-semibold" onClick={async () => { await deleteRoutine(x.id); setConfirm(null); onChanged(); }}>sure?</button>
                  : <button className="min-h-[36px] rounded-[8px] px-2 text-[12.5px] font-semibold text-ink-soft" onClick={() => setConfirm(x.id)} aria-label={`delete ${x.title}`}>×</button>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {routines.length === 0 && <p className="text-[13.5px] text-ink-soft">none yet. try typing "who is away every day" in the add box.</p>}
      <form onSubmit={add} className="flex flex-col gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-ink/40 p-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ a routine" aria-label="routine"
          className="min-h-[44px] rounded-[10px] bg-surface px-2.5 text-[16px] outline-none" />
        <div className="flex flex-wrap gap-1.5">
          <select value={rule} onChange={(e) => setRule(e.target.value)} aria-label="when"
            className="min-h-[40px] rounded-[10px] border-2 border-ink bg-surface px-2 text-[14px]">
            {RULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {rule === 'monthly' && (
            <input type="number" min={1} max={31} value={dom} onChange={(e) => setDom(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              aria-label="day of the month" className="min-h-[40px] w-[70px] rounded-[10px] border-2 border-ink bg-surface px-2 text-[16px]" />
          )}
          <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="project"
            className="min-h-[40px] min-w-0 flex-1 rounded-[10px] border-2 border-ink bg-surface px-2 text-[14px]">
            <option value="">no project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="submit" className="btn min-h-[40px] py-1">add</button>
        </div>
      </form>
    </div>
  );
}
