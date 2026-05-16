import { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet';
import { aiBreakDown } from '../../lib/ai';

interface Props {
  open: boolean;
  pageId: string;
  onClose: () => void;
  onAccept: (steps: string[]) => void;
}

function makeId() {
  return (
    crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

export default function BreakDownSheet({ open, pageId, onClose, onAccept }: Props) {
  const [steps, setSteps] = useState<Array<{ id: string; text: string; keep: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSteps([]);
    setError(null);
    setLoading(true);
    aiBreakDown(pageId)
      .then((r) => {
        setSteps(r.steps.map((s) => ({ id: makeId(), text: s, keep: true })));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, pageId]);

  function accept() {
    const accepted = steps.filter((s) => s.keep).map((s) => s.text);
    if (accepted.length > 0) onAccept(accepted);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="✦ break this down"
      subtitle="tap to drop any you don't want. accepted steps go into your checklist."
    >
      {loading && (
        <div className="py-6 text-center font-mono text-[12px] uppercase tracking-mono text-ink-soft">
          thinking…
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-[10px] border-[1.5px] border-rose-deep bg-rose/30 px-3 py-2 text-[13px]">
          {error}
        </div>
      )}
      {!loading && !error && (
        <div className="mb-4 flex flex-col gap-2">
          {steps.map((s) => (
            <button
              key={s.id}
              onClick={() =>
                setSteps((cur) =>
                  cur.map((x) => (x.id === s.id ? { ...x, keep: !x.keep } : x)),
                )
              }
              className={
                'flex items-start gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left transition-colors ' +
                (s.keep
                  ? 'border-ink bg-surface shadow-card-sm'
                  : 'border-ink-faint bg-bg-soft opacity-60 line-through')
              }
            >
              <span
                className={
                  'mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink ' +
                  (s.keep ? 'bg-mint-deep' : 'bg-surface')
                }
              >
                {s.keep && <span className="text-[10px] font-bold">✓</span>}
              </span>
              <span className="flex-1 text-[14px] leading-snug">{s.text}</span>
            </button>
          ))}
          {steps.length === 0 && (
            <p className="py-4 text-center font-mono text-[12px] uppercase tracking-mono text-ink-soft">
              no steps came back — try a more specific title
            </p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="btn flex-1">
          cancel
        </button>
        <button
          onClick={accept}
          disabled={loading || steps.filter((s) => s.keep).length === 0}
          className="btn btn-primary flex-1 disabled:opacity-60"
        >
          add to checklist
        </button>
      </div>
    </Sheet>
  );
}
