import { useState } from 'react';
import { aiStuck } from '../../lib/ai';

interface Props {
  pageId: string;
}

type Status = 'idle' | 'loading' | 'shown' | 'error';

export default function StuckCard({ pageId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [response, setResponse] = useState<string | null>(null);
  const [kind, setKind] = useState<'question' | 'action'>('question');

  async function go() {
    setStatus('loading');
    try {
      const r = await aiStuck(pageId);
      setResponse(r.response);
      setKind(r.kind);
      setStatus('shown');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[stuck]', err);
      setStatus('error');
    }
  }

  if (status === 'idle') {
    return (
      <div className="mx-3.5 mb-3">
        <button onClick={go} className="pill-action">
          <span className="text-coral">✦</span> i'm stuck
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
      <div className="mx-3.5 mb-3 flex items-center justify-between rounded-[14px] border-[1.5px] border-rose-deep bg-rose/40 px-3.5 py-3 text-[13px]">
        <span>ai is napping — try again in a sec</span>
        <button onClick={() => setStatus('idle')} className="font-mono text-[11px] uppercase">
          dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3.5 mb-3 rounded-[14px] border-2 border-ink bg-butter px-3.5 py-3 shadow-card-sm">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-mono-wide text-ink-soft">
        {kind === 'question' ? '✦ a question' : '✦ try this'}
      </div>
      <p className="text-[14px] leading-snug">{response}</p>
      <div className="mt-2 flex gap-3">
        <button
          onClick={() => setStatus('idle')}
          className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline"
        >
          dismiss
        </button>
        <button
          onClick={go}
          className="font-mono text-[11px] uppercase tracking-mono text-ink-soft underline"
        >
          another
        </button>
      </div>
    </div>
  );
}
