import { useState } from 'react';
import clsx from 'clsx';
import Sheet from '../ui/Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: (opts: { minutes: number; countUp: boolean; notify: boolean }) => void;
}

const PRESETS = [15, 25, 45, 90] as const;

export default function TimerSheet({ open, onClose, onStart }: Props) {
  const [mins, setMins] = useState<number>(25);
  const [countUp, setCountUp] = useState(false);
  const [notify, setNotify] = useState(true);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="set a timer"
      subtitle="pick a length. you can switch to count-up if you don't want a target."
    >
      <div className="mb-3.5 flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setMins(p)}
            className={clsx(
              'flex-1 rounded-[11px] border-[1.5px] border-ink bg-surface px-2 py-3 text-center shadow-card-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
              mins === p && 'bg-butter',
            )}
          >
            <div className="font-mono text-[22px] leading-none">{p}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
              min
            </div>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2.5">
        <Toggle
          label="count up instead"
          desc="no target, just track time"
          on={countUp}
          onToggle={() => setCountUp((v) => !v)}
        />
        <Toggle
          label="notify me when done"
          desc="browser notification when target hits"
          on={notify}
          onToggle={() => setNotify((v) => !v)}
        />
      </div>

      <button
        onClick={() => {
          if (notify && 'Notification' in window && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
          onStart({ minutes: mins, countUp, notify });
          onClose();
        }}
        className="btn btn-primary w-full text-[15px]"
      >
        ▶ start timer
      </button>
    </Sheet>
  );
}

function Toggle({
  label,
  desc,
  on,
  onToggle,
}: {
  label: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[11px] border-[1.5px] border-ink bg-surface px-3.5 py-2.5">
      <div className="flex-1">
        <div className="text-[14px] font-semibold">{label}</div>
        <div className="text-[12px] text-ink-soft">{desc}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          'relative h-[22px] w-[38px] flex-shrink-0 rounded-[12px] border-[1.5px] border-ink transition-colors',
          on ? 'bg-mint-deep' : 'bg-ink-faint',
        )}
        aria-pressed={on}
      >
        <span
          className={clsx(
            'absolute top-[1px] block h-[16px] w-[16px] rounded-full border-[1.5px] border-ink bg-surface transition-[left]',
            on ? 'left-[18px]' : 'left-[1px]',
          )}
        />
      </button>
    </div>
  );
}
