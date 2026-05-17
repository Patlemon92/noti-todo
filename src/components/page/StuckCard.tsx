import { useState } from 'react';
import clsx from 'clsx';
import { aiAsk, aiStuck } from '../../lib/ai';

interface Props {
  pageId: string;
  /** Adds the shown response to the current task's checklist. Only used for action mode. */
  onAddToChecklist?: (text: string) => Promise<void> | void;
}

type Mode = 'action' | 'question';
type Status = 'idle' | 'loading' | 'shown' | 'error';

export default function StuckCard({ pageId, onAddToChecklist }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [mode, setMode] = useState<Mode | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function run(next: Mode) {
    setMode(next);
    setStatus('loading');
    setErrMsg(null);
    setAdded(false);
    try {
      const r = next === 'action' ? await aiStuck(pageId) : await aiAsk(pageId);
      // eslint-disable-next-line no-console
      console.info(`[${next}]`, r);
      if (!r.response || !r.response.trim()) {
        setErrMsg('ai returned an empty response');
        setStatus('error');
        return;
      }
      setResponse(r.response);
      setStatus('shown');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[${next}]`, err);
      setErrMsg(msg.slice(0, 140));
      setStatus('error');
    }
  }

  if (status === 'idle') {
    return (
      <div className="mx-3.5 mb-3 flex flex-wrap gap-2">
        <button onClick={() => run('action')} className="pill-action">
          <span className="text-coral">✦</span> i'm stuck
        </button>
        <button onClick={() => run('question')} className="pill-action">
          <span className="text-coral">✦</span> ask me something
        </button>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="mx-3.5 mb-3 rounded-[14px] border-[1.5px] border-dashed border-ink-faint bg-butter/40 px-3.5 py-3 font-mono text-[12px] uppercase tracking-mono text-ink-soft">
        thinking…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-3.5 mb-3 flex items-start justify-between gap-3 rounded-[14px] border-[1.5px] border-rose-deep bg-rose/40 px-3.5 py-3 text-[13px]">
        <div className="flex-1">
          <div className="font-semibold">ai is napping</div>
          {errMsg && (
            <div className="mt-0.5 text-[11px] text-ink-soft">{errMsg}</div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {mode && (
            <button
              onClick={() => run(mode)}
              className="font-mono text-[11px] uppercase underline"
            >
              retry
            </button>
          )}
          <button
            onClick={() => {
              setStatus('idle');
              setMode(null);
              setResponse(null);
            }}
            className="font-mono text-[11px] uppercase"
          >
            dismiss
          </button>
        </div>
      </div>
    );
  }

  // shown
  const isQuestion = mode === 'question';
  return (
    <div
      className={clsx(
        'mx-3.5 mb-3 rounded-[14px] border-2 border-ink px-3.5 py-3 shadow-card-sm',
        isQuestion ? 'bg-lavender' : 'bg-butter',
      )}
    >
      <div className="mb-1 font-mono text-[10px] uppercase tracking-mono-wide text-ink-soft">
        {isQuestion ? '✦ a question' : '✦ try this'}
      </div>
      <p className="text-[14px] leading-snug">{response}</p>
      {!isQuestion && onAddToChecklist && response && (
        <div className="mt-2.5">
          <button
            onClick={async () => {
              if (added) return;
              await onAddToChecklist(response);
              setAdded(true);
            }}
            disabled={added}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-ink bg-surface px-3 py-1 text-[12px] font-medium shadow-card-sm transition-all',
              added && 'bg-mint',
            )}
          >
            <span className="text-coral">{added ? '✓' : '+'}</span>
            {added ? 'added to checklist' : 'add to checklist'}
          </button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        <button
          onClick={() => {
            setStatus('idle');
            setMode(null);
            setResponse(null);
            setAdded(false);
          }}
          className="font-mono uppercase tracking-mono text-ink-soft underline"
        >
          dismiss
        </button>
        {mode && (
          <button
            onClick={() => run(mode)}
            className="font-mono uppercase tracking-mono text-ink-soft underline"
          >
            another
          </button>
        )}
        {isQuestion ? (
          <button
            onClick={() => run('action')}
            className="font-mono uppercase tracking-mono text-ink-soft underline"
          >
            give me an action instead
          </button>
        ) : (
          <button
            onClick={() => run('question')}
            className="font-mono uppercase tracking-mono text-ink-soft underline"
          >
            ask me something instead
          </button>
        )}
      </div>
    </div>
  );
}
