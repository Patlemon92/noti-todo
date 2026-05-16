import { useState } from 'react';
import clsx from 'clsx';
import Sheet from '../ui/Sheet';
import {
  PRESET_LABELS,
  presetToDate,
  toDateTimeLocal,
  fromDateTimeLocal,
  createReminder,
  type ReminderPreset,
} from '../../lib/reminders';
import { ensurePushSubscription, getPushSupport } from '../../lib/push';

interface Props {
  open: boolean;
  pageId: string;
  pageTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

const PRESETS: ReminderPreset[] = [
  'in-15-min',
  'in-1-hour',
  'in-3-hours',
  'tomorrow-9am',
  'next-monday-9am',
];

type Stage = 'pick' | 'saving' | 'permission-prompt';

export default function ReminderSheet({
  open,
  pageId,
  pageTitle,
  onClose,
  onSaved,
}: Props) {
  const [picked, setPicked] = useState<Date | null>(null);
  const [customStr, setCustomStr] = useState<string>(
    toDateTimeLocal(presetToDate('in-1-hour')),
  );
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>('pick');
  const [warning, setWarning] = useState<string | null>(null);

  function reset() {
    setPicked(null);
    setText('');
    setCustomStr(toDateTimeLocal(presetToDate('in-1-hour')));
    setStage('pick');
    setWarning(null);
  }

  async function save() {
    const due = picked ?? fromDateTimeLocal(customStr);
    if (Number.isNaN(due.getTime())) {
      setWarning('that date doesn\'t parse');
      return;
    }
    if (due.getTime() <= Date.now() + 30 * 1000) {
      setWarning('pick a time more than 30 seconds from now');
      return;
    }
    setStage('saving');
    setWarning(null);

    // Best-effort push subscription. We still save the reminder if push is
    // refused — it just won't fire on the lock screen for this device.
    const sub = await ensurePushSubscription();
    const pushWarning = sub.ok
      ? null
      : `reminder saved, but push didn't enable on this device (${sub.reason}). other devices will still get it.`;

    try {
      const created = await createReminder({
        page_id: pageId,
        due_at: due.toISOString(),
        text: text.trim() || undefined,
      });
      // eslint-disable-next-line no-console
      console.info('[reminder saved]', created.id, 'due', due.toISOString());
      onSaved();
      if (pushWarning) {
        // surface the push-only warning briefly, but still close + reset
        // so the user sees the pill on the page
        setWarning(pushWarning);
        window.setTimeout(() => {
          reset();
          onClose();
        }, 1800);
      } else {
        reset();
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[reminder save FAILED]', err);
      setWarning(`save failed: ${msg}`);
      setStage('pick');
    }
  }

  const support = getPushSupport();

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="add reminder"
      subtitle={`for: ${pageTitle || 'untitled'}`}
    >
      {support.kind === 'unsupported' && (
        <div className="mb-3 rounded-[10px] border-[1.5px] border-butter-deep bg-butter px-3 py-2 text-[13px] leading-snug">
          this device can't get lock-screen push: <em>{support.reason}</em>. the
          reminder will still save, and fire if you have the tab open.
        </div>
      )}

      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
        quick pick
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const isSel =
            picked !== null &&
            picked.getTime() === presetToDate(p).getTime();
          return (
            <button
              key={p}
              onClick={() => {
                const d = presetToDate(p);
                setPicked(d);
                setCustomStr(toDateTimeLocal(d));
              }}
              className={clsx(
                'rounded-pill border-[1.5px] px-3 py-1.5 text-[13px] font-medium transition-colors',
                isSel
                  ? 'border-ink bg-ink text-bg'
                  : 'border-ink-faint bg-surface text-ink-soft hover:border-ink hover:text-ink',
              )}
            >
              {PRESET_LABELS[p]}
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

      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
        message (optional)
      </div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="anything specific?"
        maxLength={140}
        className="mb-4 w-full rounded-[10px] border-2 border-ink bg-surface px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-faint"
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
          disabled={stage === 'saving'}
          className="btn btn-primary flex-1 disabled:opacity-60"
        >
          {stage === 'saving' ? 'saving…' : '↻ remind me'}
        </button>
      </div>
    </Sheet>
  );
}
