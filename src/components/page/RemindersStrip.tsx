import { useEffect, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { listReminders, deleteReminder, type Reminder } from '../../lib/reminders';

interface Props {
  pageId: string;
  refreshKey: number;
}

export default function RemindersStrip({ pageId, refreshKey }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  async function load() {
    try {
      const list = await listReminders(pageId);
      const active = list.filter((r) => {
        const p = r.payload ?? {};
        if (p.dismissed_at) return false;
        // hide past-and-sent reminders unless they're still queued
        if (p.sent_at && p.due_at < new Date(Date.now() - 60 * 60 * 1000).toISOString()) {
          return false;
        }
        return true;
      });
      setReminders(active);
    } catch {
      setReminders([]);
    }
  }

  useEffect(() => {
    void load();
  }, [pageId, refreshKey]);

  async function onRemove(id: string) {
    await deleteReminder(id);
    void load();
  }

  if (reminders.length === 0) return null;

  return (
    <div className="mx-3.5 mb-3 flex flex-wrap gap-1.5">
      {reminders.map((r) => {
        const due = new Date(r.payload.due_at);
        const isPast = due.getTime() <= Date.now();
        const label = isPast
          ? `fired ${formatDistanceToNowStrict(due)} ago`
          : `in ${formatDistanceToNowStrict(due)}`;
        const stamp = format(due, 'EEE d MMM · h:mma').toLowerCase();
        return (
          <span
            key={r.id}
            className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-ink bg-butter px-2.5 py-1 text-[12px] font-medium shadow-card-sm"
          >
            <span className="text-coral">↻</span>
            <span>{label}</span>
            <span className="font-mono text-[10px] uppercase tracking-mono opacity-60">
              {stamp}
            </span>
            <button
              onClick={() => void onRemove(r.id)}
              aria-label="remove reminder"
              title="remove"
              className="-mr-1 ml-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-ink-soft hover:bg-ink/10 hover:text-ink"
            >
              ✕
            </button>
          </span>
        );
      })}
    </div>
  );
}
