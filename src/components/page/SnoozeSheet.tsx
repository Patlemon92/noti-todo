import { useState } from 'react';
import clsx from 'clsx';
import Sheet from '../ui/Sheet';
import {
  presetToDate,
  toDateTimeLocal,
  fromDateTimeLocal,
  type ReminderPreset,
} from '../../lib/reminders';
import { updatePage } from '../../lib/db';
import type { Page, TaskProperties } from '../../lib/types';

interface Props {
  open: boolean;
  page: Page | null;
  onClose: () => void;
  onSnoozed: (untilIso: string) => void;
}

const PRESETS: Array<{ key: ReminderPreset; label: string }> = [
  { key: 'in-15-min', label: 'in 15 min' },
  { key: 'in-1-hour', label: 'in 1 hour' },
  { key: 'in-3-hours', label: 'in 3 hours' },
  { key: 'tomorrow-9am', label: 'tomorrow 9am' },
  { key: 'next-monday-9am', label: 'next monday' },
];

export default function SnoozeSheet({ open, page, onClose, onSnoozed }: Props) {
  const [picked, setPicked] = useState<Date | null>(null);
  const [customStr, setCustomStr] = useState<string>(
    toDateTimeLocal(presetToDate('tomorrow-9am')),
  );
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  function reset() {
    setPicked(null);
    setSaving(false);
    setWarning(null);
    setCustomStr(toDateTimeLocal(presetToDate('tomorrow-9am')));
  }

  async function save() {
    if (!page) return;
    const due = picked ?? fromDateTimeLocal(customStr);
    if (Number.isNaN(due.getTime())) {
      setWarning("that date doesn't parse");
      return;
    }
    if (due.getTime() <= Date.now() + 30 * 1000) {
      setWarning('pick a time more than 30 seconds from now');
      return;
    }
    setSaving(true);
    try {
      const props = (page.properties as TaskProperties | undefined) ?? {};
      const nextProps: TaskProperties = {
        ...props,
        snoozed_until: due.toISOString(),
      };
      await updatePage(page.id, { properties: nextProps });
      onSnoozed(due.toISOString());
      reset();
      onClose();
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open && !!page}
      onClose={() => {
        reset();
        onClose();
      }}
      title="hide until…"
      subtitle={page ? `not this: ${page.title || 'untitled'}` : ''}
    >
      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
        quick pick
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const target = presetToDate(p.key);
          const isSel = picked !== null && picked.getTime() === target.getTime();
          return (
            <button
              key={p.key}
              onClick={() => {
                setPicked(target);
                setCustomStr(toDateTimeLocal(target));
              }}
              className={clsx(
                'rounded-pill border-[1.5px] px-3 py-1.5 text-[13px] font-medium transition-colors',
                isSel
                  ? 'border-ink bg-ink text-bg'
                  : 'border-ink-faint bg-surface text-ink-soft hover:border-ink hover:text-ink',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
        or pick a time
      </div>
      <input
        type="datetime-local"
        value={customStr}
        onChange={(e) => {
          setCustomStr(e.target.value);
          setPicked(null);
        }}
        className="mb-4 w-full rounded-[10px] border-2 border-ink bg-surface px-3 py-2.5 text-[15px] outline-none"
      />

      {warning && (
        <div className="mb-3 rounded-[10px] border-[1.5px] border-rose-deep bg-rose/30 px-3 py-2 text-[13px]">
          {warning}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => { reset(); onClose(); }} className="btn flex-1">
          cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="btn btn-primary flex-1 disabled:opacity-60"
        >
          {saving ? 'snoozing…' : '↻ snooze'}
        </button>
      </div>
    </Sheet>
  );
}
