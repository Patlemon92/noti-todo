import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Sheet from '../ui/Sheet';
import { LANES, type Card, type Goal, type Lane, type Project, type Step } from '../../lib/board';
import type { Kind } from '../../lib/quickAdd';
import { tagClass } from './CardTile';

const KINDS: Kind[] = ['task', 'fix', 'idea', 'reminder', 'info'];

interface Props {
  card: Card | null;
  projects: Project[];
  goals: Goal[];
  onClose: () => void;
  onPatch: (fields: Partial<Card>) => void;
}

/** Everything about one card, one tap away. Changes save as you make them. */
export default function CardSheet({ card, projects, goals, onClose, onPatch }: Props) {
  const [title, setTitle] = useState('');
  const [step, setStep] = useState('');
  const [tag, setTag] = useState('');
  useEffect(() => { setTitle(card?.title ?? ''); setStep(''); setTag(''); }, [card?.id]);
  if (!card) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const saveTitle = () => { const t = title.trim(); if (t && t !== card.title) onPatch({ title: t }); };
  const setSteps = (steps: Step[]) => onPatch({ steps });
  const chip = (on: boolean) => clsx('min-h-[40px] rounded-pill border-2 px-3.5 text-[14px] font-semibold', on ? 'border-ink bg-ink text-bg' : 'border-ink/25 bg-surface');

  return (
    <Sheet open={!!card} onClose={() => { saveTitle(); onClose(); }}>
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <label className="sr-only" htmlFor="card-title">title</label>
        <textarea id="card-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} rows={2}
          className="w-full resize-none rounded-[14px] border-2 border-ink bg-surface px-3 py-2 font-serif text-[20px] font-semibold leading-snug outline-none" />
        {card.body && <p className="whitespace-pre-wrap break-words text-[14px] text-ink-soft">{card.body}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary min-h-[48px]" onClick={() => { onPatch({ status: card.status === 'done' ? 'open' : 'done' }); onClose(); }}>
            {card.status === 'done' ? 'not done' : 'done ✓'}
          </button>
          <button className="btn min-h-[48px]" onClick={() => { onPatch({ status: 'dropped' }); onClose(); }}>drop it</button>
        </div>

        <section>
          <p className="mono-eyebrow mb-1.5">when</p>
          <div className="flex flex-wrap gap-1.5">
            {LANES.map((l) => (
              <button key={l.id} className={chip(card.lane === l.id)} onClick={() => onPatch({ lane: l.id as Lane })}>{l.name}</button>
            ))}
            <button className={chip(card.lane === null)} onClick={() => onPatch({ lane: null })}>just the project</button>
          </div>
          <div className="mt-2 flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">date
              <input type="date" value={card.due_date ?? ''} onChange={(e) => onPatch({ due_date: e.target.value || null })}
                className="min-h-[44px] rounded-[12px] border-2 border-ink bg-surface px-2 text-[16px] text-ink" />
            </label>
            <label className="flex w-[130px] flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">time
              <input type="time" value={card.due_time?.slice(0, 5) ?? ''} onChange={(e) => onPatch({ due_time: e.target.value || null })}
                className="min-h-[44px] rounded-[12px] border-2 border-ink bg-surface px-2 text-[16px] text-ink" />
            </label>
          </div>
        </section>

        <section>
          <p className="mono-eyebrow mb-1.5">project</p>
          <div className="flex flex-wrap gap-1.5">
            {projects.filter((p) => !p.archived).map((p) => (
              <button key={p.id} className={clsx(chip(card.project_id === p.id), 'inline-flex items-center gap-1.5')} onClick={() => onPatch({ project_id: card.project_id === p.id ? null : p.id })}>
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mono-eyebrow mb-1.5">what it is</p>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => <button key={k} className={chip(card.kind === k)} onClick={() => onPatch({ kind: k })}>{k}</button>)}
          </div>
        </section>

        <section>
          <p className="mono-eyebrow mb-1.5">steps</p>
          <div className="flex flex-col gap-1">
            {card.steps.map((s, i) => (
              <button key={i} onClick={() => setSteps(card.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                className="flex min-h-[40px] items-center gap-2.5 rounded-[10px] px-1 text-left">
                <span className={clsx('flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border-2 border-ink text-[12px]', s.done && 'bg-mint-deep text-surface')}>{s.done ? '✓' : ''}</span>
                <span className={clsx('text-[14.5px]', s.done && 'text-ink-soft line-through')}>{s.t}</span>
              </button>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); if (step.trim()) { setSteps([...card.steps, { t: step.trim(), done: false }]); setStep(''); } }}>
              <input value={step} onChange={(e) => setStep(e.target.value)} placeholder="+ a small step" aria-label="add a step"
                className="min-h-[44px] w-full rounded-[12px] border-[1.5px] border-dashed border-ink/40 bg-transparent px-3 text-[16px] outline-none" />
            </form>
          </div>
        </section>

        <section>
          <p className="mono-eyebrow mb-1.5">labels</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {card.tags.map((t) => (
              <button key={t} onClick={() => onPatch({ tags: card.tags.filter((x) => x !== t) })} className={clsx('min-h-[36px] rounded-[8px] px-2.5 text-[13px] font-semibold', tagClass(t))} aria-label={`remove label ${t}`}>{t} ×</button>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); const t = tag.trim().toLowerCase().replace(/^#/, ''); if (t && !card.tags.includes(t)) onPatch({ tags: [...card.tags, t] }); setTag(''); }}>
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ label" aria-label="add a label"
                className="min-h-[36px] w-[110px] rounded-[8px] border-[1.5px] border-dashed border-ink/40 bg-transparent px-2 text-[16px] outline-none" />
            </form>
          </div>
        </section>

        {goals.length > 0 && (
          <section>
            <p className="mono-eyebrow mb-1.5">towards a goal</p>
            <div className="flex flex-wrap gap-1.5">
              {goals.map((g) => (
                <button key={g.id} className={chip(card.goal_id === g.id)} onClick={() => onPatch({ goal_id: card.goal_id === g.id ? null : g.id })}>{g.title}</button>
              ))}
            </div>
          </section>
        )}
        <p className="font-mono text-[14px] text-ink-faint">#{card.id}</p>
      </div>
    </Sheet>
  );
}
