import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Sheet from '../ui/Sheet';
import { updatePage } from '../../lib/db';
import type { Page, TaskProperties, TaskRecurrence } from '../../lib/types';

interface Props {
  open: boolean;
  page: Page | null;
  onClose: () => void;
  onSaved?: () => void;
}

type PresetKey = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

const PRESETS: Array<{ key: PresetKey; label: string; hint?: string }> = [
  { key: 'none', label: "doesn't repeat" },
  { key: 'daily', label: 'every day' },
  { key: 'weekdays', label: 'weekdays only', hint: 'mon-fri' },
  { key: 'weekly', label: 'every week' },
  { key: 'biweekly', label: 'every 2 weeks' },
  { key: 'monthly', label: 'every month' },
  { key: 'custom', label: 'every N days' },
];

export default function RecurrenceSheet({ open, page, onClose, onSaved }: Props) {
  const props = (page?.properties as TaskProperties | undefined) ?? {};
  const initialRule: PresetKey = props.recurrence?.rule ?? 'none';
  const initialN = props.recurrence?.every_n_days ?? 3;

  const [picked, setPicked] = useState<PresetKey>(initialRule);
  const [n, setN] = useState(initialN);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(initialRule);
      setN(initialN);
    }
  }, [open, initialRule, initialN]);

  async function save() {
    if (!page) return;
    setSaving(true);
    const next: TaskProperties = { ...props };
    if (picked === 'none') {
      delete next.recurrence;
    } else if (picked === 'custom') {
      next.recurrence = { rule: 'custom', every_n_days: Math.max(1, n) };
    } else {
      next.recurrence = { rule: picked as TaskRecurrence['rule'] };
    }
    try {
      await updatePage(page.id, { properties: next });
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open && !!page}
      onClose={onClose}
      title="repeat"
      subtitle={
        page
          ? `completing this task will spawn the next one based on this rule. snoozed until it's due.`
          : ''
      }
    >
      <div className="mb-4 flex flex-col gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPicked(p.key)}
            className={clsx(
              'flex items-center justify-between rounded-[11px] border-[1.5px] px-3 py-2.5 text-left',
              picked === p.key
                ? 'border-ink bg-bg-soft shadow-card-sm'
                : 'border-ink-faint hover:border-ink',
            )}
          >
            <span className="text-[14px] font-medium">{p.label}</span>
            {p.hint && (
              <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
                {p.hint}
              </span>
            )}
          </button>
        ))}
        {picked === 'custom' && (
          <div className="mt-2 flex items-center gap-3 rounded-[11px] border-[1.5px] border-ink bg-bg-soft px-3 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
              every
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={n}
              onChange={(e) => setN(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-16 rounded-md border-2 border-ink bg-surface px-2 py-1 text-center font-mono text-[14px] outline-none"
            />
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
              days
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={onClose} className="btn flex-1">
          cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="btn btn-primary flex-1 disabled:opacity-60"
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>
    </Sheet>
  );
}
