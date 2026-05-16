interface Props {
  open: boolean;
  items: Array<{ id: string; text: string }>;
  durationMin: number;
  onKeepOpen: () => void;
  onMarkDone: () => void;
  onDismiss: () => void;
}

export default function SummaryPopup({
  open,
  items,
  durationMin,
  onKeepOpen,
  onMarkDone,
  onDismiss,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/50 px-5 backdrop-blur-sm">
      <div className="w-full max-w-[360px] overflow-hidden rounded-[20px] border-[2.5px] border-ink bg-surface shadow-card-lg">
        <div className="flex items-center justify-between border-b-[2.5px] border-ink bg-peach px-4 py-2.5">
          <span className="font-mono text-[13px] uppercase tracking-mono-wide">
            ★ before you go…
          </span>
          <button
            onClick={onDismiss}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink/10 text-[14px]"
            aria-label="dismiss"
          >
            ✕
          </button>
        </div>
        <div className="p-5">
          <p className="mb-3.5 font-serif text-[20px] font-medium leading-tight">
            you ticked <em className="italic">{items.length}</em>{' '}
            {items.length === 1 ? 'thing' : 'things'} off this session.{' '}
            <em className="italic">{durationMin} min</em>.
          </p>
          {items.length > 0 && (
            <div className="mb-3.5">
              {items.map((it, i) => (
                <div
                  key={it.id}
                  className={
                    'flex gap-2.5 py-1.5 text-[13.5px] font-medium' +
                    (i > 0 ? ' border-t border-dashed border-black/15' : '')
                  }
                >
                  <span className="font-bold text-mint-deep">✓</span>
                  <span className="flex-1">{it.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onMarkDone}
              className="btn btn-primary flex-1 text-[13px]"
            >
              mark task done
            </button>
            <button onClick={onKeepOpen} className="btn flex-1 text-[13px]">
              keep open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
