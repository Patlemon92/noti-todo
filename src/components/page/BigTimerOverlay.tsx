import { useEffect } from 'react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  onClose: () => void;
  display: string;
  modeLabel: string;
  paused: boolean;
  done: boolean;
  taskTitle: string;
  parentLabel?: string;
  onTogglePause: () => void;
  onStop: () => void;
}

/** Full-screen tap-to-focus timer. Tapping outside the controls closes it. */
export default function BigTimerOverlay({
  open,
  onClose,
  display,
  modeLabel,
  paused,
  done,
  taskTitle,
  parentLabel,
  onTogglePause,
  onStop,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        onTogglePause();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, onTogglePause]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[120] flex flex-col items-center justify-between bg-ink/95 px-6 py-10 text-bg animate-fadeIn backdrop-blur-md"
    >
      {/* top: context + close */}
      <div className="flex w-full items-center justify-between text-bg/80">
        {parentLabel ? (
          <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-mono-wide">
            <span className="block h-[8px] w-[8px] rounded-full border-[1.5px] border-bg/70 bg-bg/30" />
            {parentLabel}
          </div>
        ) : (
          <span />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="rounded-pill border border-bg/30 px-3 py-1.5 font-mono text-[11px] uppercase tracking-mono text-bg/80 hover:border-bg hover:text-bg"
          aria-label="minimise timer"
        >
          ✕ close
        </button>
      </div>

      {/* center: huge time + task */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center text-center"
      >
        <div
          className={clsx(
            'font-mono leading-none tabular-nums text-butter',
            'text-[clamp(96px,28vw,220px)]',
            paused && 'text-butter/60',
            done && 'text-mint',
          )}
        >
          {display}
        </div>
        <div className="mt-4 font-mono text-[14px] uppercase tracking-[0.2em] text-bg/55">
          {done ? 'done ✓' : modeLabel}
        </div>
        {taskTitle && (
          <div className="mx-auto mt-8 max-w-md font-serif text-[22px] italic leading-tight text-bg/90">
            {taskTitle}
          </div>
        )}
      </div>

      {/* bottom: controls */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md gap-3"
      >
        <button
          onClick={onTogglePause}
          className="flex-1 rounded-[14px] border-2 border-bg/40 bg-bg/10 px-4 py-4 font-sans text-[15px] font-semibold text-bg transition-colors hover:bg-bg/20 active:translate-y-[1px]"
        >
          {paused ? '▶ resume' : '⏸ pause'}
        </button>
        <button
          onClick={onStop}
          className="flex-1 rounded-[14px] border-2 border-rose-deep bg-rose-deep/20 px-4 py-4 font-sans text-[15px] font-semibold text-bg transition-colors hover:bg-rose-deep/30 active:translate-y-[1px]"
        >
          ◼ stop
        </button>
      </div>

      <div className="mt-3 font-mono text-[10px] uppercase tracking-mono-wide text-bg/40">
        space to pause · esc to close
      </div>
    </div>
  );
}
