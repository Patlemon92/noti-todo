import { useState } from 'react';
import Sheet from '../ui/Sheet';
import {
  buildDueAt,
  getOrCreateJournalBoard,
  type ItemCategory,
} from '../../lib/journalSnaps';
import { createPage } from '../../lib/db';
import { createReminder } from '../../lib/reminders';
import type { TaskProperties } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a task lands so the parent can reload its list. */
  onSaved?: () => void;
}

/**
 * Manual single-task entry for the today view. Mirrors the snap-confirm
 * save shape so a typed task lands in the same place as an extracted one
 * (under the hidden journal board, same date semantics).
 *
 * - title is required
 * - date optional → drives grouping in /today
 * - time optional → drives push (no time = no push, per Patrick's rule)
 */
export default function QuickJournalAdd({ open, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDate('');
    setTime('');
    setError(null);
    setSaving(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function save() {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    setError(null);
    try {
      const boardId = await getOrCreateJournalBoard();

      // category auto-derives: with a time → reminder (fires push),
      // without → task (silent). matches the snap-confirm shape.
      const category: ItemCategory = time ? 'reminder' : 'task';
      const props: TaskProperties & { due_date?: string; raw_text?: string } = {};

      let dueAt: string | null = null;
      if (date && time) {
        const [hh, mm] = time.split(':').map((s) => parseInt(s, 10));
        if (!isNaN(hh)) {
          dueAt = buildDueAt(date, { hour: hh, minute: mm || 0 });
          props.due_at = dueAt;
        }
      } else if (date) {
        props.due_date = date;
      }

      const page = await createPage({
        type: 'task',
        title: t.slice(0, 200),
        parent_id: boardId,
        properties: props,
      });

      if (category === 'reminder' && dueAt) {
        await createReminder({ page_id: page.id, due_at: dueAt, text: t });
      }

      onSaved?.();
      close();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[quick-add]', err);
      setError(err instanceof Error ? err.message : 'save failed');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="add a task"
      subtitle="type it now if you can't snap. date and time are optional — without a time it won't ping you."
    >
      <div className="space-y-3 pb-2">
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="what is it?"
          className="w-full rounded-[12px] border-2 border-ink bg-surface px-3 py-2.5 font-sans text-[16px] outline-none placeholder:text-ink-faint"
        />

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-mono text-ink-soft">
              date (optional)
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-[10px] border-2 border-ink bg-surface px-2 py-2 font-mono text-[13px] outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-mono text-ink-soft">
              time (optional)
            </span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
              className="rounded-[10px] border-2 border-ink bg-surface px-2 py-2 font-mono text-[13px] outline-none disabled:opacity-50"
            />
          </label>
        </div>

        {error && (
          <p className="rounded-[12px] border-2 border-rose-deep bg-rose/20 px-3 py-2 text-[13px] text-ink">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
            {time
              ? 'will ping you at this time'
              : date
                ? 'shows up on the day, no ping'
                : 'goes into loose ends'}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={saving || !title.trim()}
            className="rounded-[14px] border-2 border-ink bg-peach-deep px-5 py-2 font-sans text-[14px] font-semibold text-ink shadow-card transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-card-sm disabled:opacity-50"
          >
            {saving ? 'saving…' : 'add'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
