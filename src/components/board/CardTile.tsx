import clsx from 'clsx';
import type { Card, Project } from '../../lib/board';
import { dueWords } from '../../lib/board';

const PASTELS = ['bg-peach', 'bg-butter', 'bg-mint', 'bg-lavender', 'bg-sky', 'bg-rose'];
export const tagClass = (t: string) => PASTELS[[...t].reduce((n, ch) => n + ch.charCodeAt(0), 0) % PASTELS.length];

interface Props {
  card: Card;
  projects: Project[];
  onOpen?: () => void;
  onTick?: () => void;
  lifted?: boolean;
  /** Inside a project's own view the project label is just repetition. */
  hideProject?: boolean;
}

/** One card: tick, title, and a quiet line of what it belongs to and when. */
export default function CardTile({ card, projects, onOpen, onTick, lifted, hideProject }: Props) {
  const project = hideProject ? undefined : projects.find((p) => p.id === card.project_id);
  const done = card.status === 'done';
  const steps = card.steps?.length ? `${card.steps.filter((s) => s.done).length}/${card.steps.length}` : '';
  const due = dueWords(card.due_date, card.due_time);
  const today = due.startsWith('today') || due.startsWith('from');
  return (
    <div className={clsx(
      'flex items-start gap-2.5 rounded-[14px] border-2 border-ink bg-surface p-2.5',
      lifted ? 'shadow-card-lg' : 'shadow-card-sm',
    )}>
      <button
        type="button"
        onClick={onTick}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={done ? `not done: ${card.title}` : `done: ${card.title}`}
        className={clsx(
          'mt-[1px] flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border-2 border-ink text-[14px] font-bold transition-colors',
          done ? 'bg-mint-deep text-surface' : 'bg-surface hover:bg-mint',
        )}
      >
        {done ? '✓' : ''}
      </button>
      <button type="button" onClick={onOpen} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-1 text-left">
        <span className={clsx('block break-words text-[15px] font-medium leading-snug', done && 'text-ink-soft line-through')}>{card.title}</span>
        {(project || card.tags.length > 0 || due || steps || card.kind !== 'task') && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {project && (
              <span className="inline-flex items-center gap-1 rounded-pill border-[1.5px] border-ink/20 px-2 py-[1px] text-[12px] font-semibold text-ink">
                <i className="h-2 w-2 rounded-full" style={{ background: project.color }} />{project.name}
              </span>
            )}
            {card.kind !== 'task' && card.kind !== 'reminder' && (
              <span className="rounded-pill bg-ink px-2 py-[1px] font-mono text-[13px] uppercase tracking-mono text-bg">{card.kind}</span>
            )}
            {card.tags.map((t) => <span key={t} className={clsx('rounded-[6px] px-1.5 py-[1px] text-[12px] font-semibold', tagClass(t))}>{t}</span>)}
            {due && <span className={clsx('rounded-[6px] px-1.5 font-mono text-[14px] tracking-mono', today ? 'bg-peach text-ink' : 'text-ink-soft')}>{due}</span>}
            {steps && <span className="font-mono text-[14px] text-ink-soft">☑ {steps}</span>}
            {card.link_url && <span className="text-[12px] text-ink-soft">link ↗</span>}
          </span>
        )}
      </button>
    </div>
  );
}
