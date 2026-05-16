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

  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function go() {
    setStatus('loading');
    setErrMsg(null);
    try {
      const r = await aiStuck(pageId);
      // eslint-disable-next-line no-console
      console.info('[stuck]', r);
      if (!r.response || !r.response.trim()) {
        setErrMsg('ai returned an empty response');
        setStatus('error');
        return;
      }
      setResponse(r.response);
      setKind(r.kind);
      setStatus('shown');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[stuck]', err);
      setErrMsg(msg.slice(0, 140));
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
      <div className="mx-3.5 mb-3 flex items-start justify-between gap-3 rounded-[14px] border-[1.5px] border-rose-deep bg-rose/40 px-3.5 py-3 text-[13px]">
        <div className="flex-1">
          <div className="font-semibold">ai is napping</div>
          {errMsg && <div className="mt-0.5 text-[11px] text-ink-soft">{errMsg}</div>}
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={go} className="font-mono text-[11px] uppercase underline">
            retry
          </button>
          <button onClick={() => setStatus('idle')} className="font-mono text-[11px] uppercase">
            dismiss
          </button>
        </div>
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
