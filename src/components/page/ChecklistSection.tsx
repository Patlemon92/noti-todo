import { useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { ChecklistItem } from '../../lib/types';
import { formatDistanceToNowStrict } from 'date-fns';

interface Props {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[], toggled?: ChecklistItem) => void;
}

function makeId() {
  return (
    crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

export default function ChecklistSection({ items, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const done = items.filter((i) => i.done).length;

  function toggle(id: string) {
    let toggled: ChecklistItem | undefined;
    const next = items.map((it) => {
      if (it.id !== id) return it;
      const updated = {
        ...it,
        done: !it.done,
        done_at: !it.done ? new Date().toISOString() : undefined,
      };
      toggled = updated;
      return updated;
    });
    onChange(next, toggled);
  }

  function onAdd(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const text = draft.trim();
    if (!text) return;
    const next = [...items, { id: makeId(), text, done: false }];
    setDraft('');
    onChange(next);
  }

  return (
    <div className="surface-card mx-3.5 mb-4 overflow-hidden">
      <div className="flex items-center justify-between border-b-[1.5px] border-dashed border-ink bg-bg-soft px-3.5 py-2.5">
        <h3 className="flex items-center gap-2 font-mono text-[14px] uppercase tracking-mono-wide">
          <span>▢</span>checklist
        </h3>
        <span className="font-mono text-[12px] text-ink-soft">
          {done} / {items.length}
        </span>
      </div>
      <div className="px-3.5 py-3">
        {items.length === 0 && (
          <p className="mb-2 text-[13px] italic text-ink-soft">
            no steps yet — add one below or use ✦ break this down.
          </p>
        )}
        {items.map((it) => (
          <div
            key={it.id}
            onClick={() => toggle(it.id)}
            className={clsx(
              'flex cursor-pointer items-start gap-2.5 border-b border-dashed border-black/10 px-1 py-2 last:border-b-0',
            )}
          >
            <div
              className={clsx(
                'mt-[1px] flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-surface transition-all',
                it.done && 'bg-mint-deep',
              )}
            >
              {it.done && (
                <span className="text-[10px] font-bold text-ink">✓</span>
              )}
            </div>
            <div
              className={clsx(
                'flex-1 text-[14px] leading-snug',
                it.done && 'text-ink-soft line-through decoration-ink-faint',
              )}
            >
              {it.text}
            </div>
            {it.done && it.done_at && (
              <span className="mt-0.5 flex-shrink-0 font-mono text-[11px] uppercase tracking-mono text-ink-soft">
                {formatDistanceToNowStrict(new Date(it.done_at), { addSuffix: false })}
              </span>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2.5 px-1 pt-2.5">
          <div className="h-[18px] w-[18px] flex-shrink-0 rounded-full border-[1.5px] border-dashed border-ink-faint" />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onAdd}
            placeholder="add a step…"
            className="flex-1 border-none bg-transparent py-1 text-[14px] italic outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>
    </div>
  );
}
