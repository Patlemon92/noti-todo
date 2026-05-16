import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import BigTimerOverlay from './BigTimerOverlay';

interface Props {
  minutes: number;
  countUp: boolean;
  notify: boolean;
  taskTitle: string;
  parentLabel?: string;
  onDone?: () => void;
  onStop: () => void;
  /** If true, opens the big overlay on mount (right after the user starts it). */
  autoExpand?: boolean;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

export default function TimerChip({
  minutes,
  countUp,
  notify,
  taskTitle,
  parentLabel,
  onDone,
  onStop,
  autoExpand = true,
}: Props) {
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [expanded, setExpanded] = useState(autoExpand);
  const startedAt = useRef(Date.now());
  const accumulated = useRef(0);
  const target = minutes * 60;
  const firedDone = useRef(false);

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      const cur = accumulated.current + Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(cur);
      if (!countUp && cur >= target && !firedDone.current) {
        firedDone.current = true;
        if (notify && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('timer done', { body: taskTitle, icon: '/icons/icon-192.png' });
        }
        onDone?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [paused, countUp, target, notify, taskTitle, onDone]);

  useEffect(() => {
    const titleBase = document.title;
    return () => {
      document.title = titleBase;
    };
  }, []);

  useEffect(() => {
    const display = countUp ? fmt(elapsed) : fmt(Math.max(0, target - elapsed));
    document.title = `${display} · ${taskTitle.slice(0, 40)}`;
  }, [elapsed, countUp, target, taskTitle]);

  function togglePause() {
    if (paused) {
      startedAt.current = Date.now();
      setPaused(false);
    } else {
      accumulated.current += Math.floor((Date.now() - startedAt.current) / 1000);
      setPaused(true);
    }
  }

  const remaining = countUp ? elapsed : Math.max(0, target - elapsed);
  const done = !countUp && remaining === 0;
  const display = fmt(remaining);
  const modeLabel = countUp ? 'count up' : 'focus';

  return (
    <>
      <div
        className={clsx(
          'mx-3.5 mb-4 flex items-center gap-3 rounded-[14px] border-2 border-ink bg-ink px-3.5 py-3 text-bg shadow-butter',
          paused && 'opacity-90',
        )}
      >
        {/* Tapping anywhere on the chip body opens the big overlay.
            Buttons inside use stopPropagation so they don't expand. */}
        <button
          onClick={() => setExpanded(true)}
          className="flex flex-1 items-center gap-3 text-left"
          aria-label="expand timer"
          title="tap to expand"
        >
          <span
            className={clsx(
              'h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[#f44]',
              paused ? '' : 'animate-pulseDot',
              paused && 'bg-ink-soft',
            )}
          />
          <div className="font-mono text-[24px] leading-none text-butter">{display}</div>
          <div className="flex-1 font-mono text-[11px] uppercase tracking-mono text-bg/55">
            {done ? 'done ✓' : modeLabel}
          </div>
          <span className="font-mono text-[14px] text-bg/40" aria-hidden>⤢</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePause();
          }}
          className="rounded-md border border-bg/25 bg-bg/10 px-2.5 py-1.5 text-[12px] font-semibold"
        >
          {paused ? 'resume' : 'pause'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStop();
          }}
          className="rounded-md border border-bg/25 bg-bg/10 px-2.5 py-1.5 text-[12px] font-semibold"
        >
          stop
        </button>
      </div>

      <BigTimerOverlay
        open={expanded}
        onClose={() => setExpanded(false)}
        display={display}
        modeLabel={modeLabel}
        paused={paused}
        done={done}
        taskTitle={taskTitle}
        parentLabel={parentLabel}
        onTogglePause={togglePause}
        onStop={() => {
          setExpanded(false);
          onStop();
        }}
      />
    </>
  );
}
