import { useState } from 'react';
import Sheet from '../ui/Sheet';

export type ActionKey =
  | 'timer'
  | 'reminder'
  | 'link'
  | 'page-link'
  | 'image'
  | 'snooze'
  | 'delegate'
  | 'canvas';

interface Props {
  onAction: (key: ActionKey) => void;
}

const PILLS: { key: ActionKey; label: string }[] = [
  { key: 'timer', label: 'add a timer' },
  { key: 'canvas', label: 'add canvas' },
  { key: 'reminder', label: 'add reminder' },
  { key: 'link', label: 'add link' },
  { key: 'page-link', label: 'link a page' },
  { key: 'image', label: 'add image' },
  { key: 'snooze', label: 'snooze' },
  { key: 'delegate', label: 'delegate' },
];

const COMING_SOON: Partial<Record<ActionKey, string>> = {
  link: 'inline link via the floating toolbar already works. dedicated url-pin lands in stage 3.',
  image:
    'image attachments need supabase storage hooked up — coming in stage 3.',
  delegate:
    'sharing tasks with others lives in stage 4 (the collaboration milestone).',
};

export default function ActionRow({ onAction }: Props) {
  const [comingSoon, setComingSoon] = useState<ActionKey | null>(null);

  function handle(key: ActionKey) {
    if (
      key === 'timer' ||
      key === 'page-link' ||
      key === 'reminder' ||
      key === 'snooze' ||
      key === 'canvas'
    ) {
      onAction(key);
      return;
    }
    setComingSoon(key);
  }

  return (
    <>
      <div
        className="flex gap-2 overflow-x-auto px-3.5 pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="toolbar"
        aria-label="page actions"
      >
        {PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="pill-action"
            onClick={() => handle(p.key)}
          >
            <span className="font-mono text-base leading-none text-ink-soft">+</span>
            {p.label}
          </button>
        ))}
      </div>
      <Sheet
        open={comingSoon !== null}
        onClose={() => setComingSoon(null)}
        title="coming soon"
        subtitle={comingSoon ? PILLS.find((p) => p.key === comingSoon)?.label : ''}
      >
        <p className="text-[14px] leading-relaxed">
          {comingSoon ? COMING_SOON[comingSoon] : ''}
        </p>
        <button
          onClick={() => setComingSoon(null)}
          className="btn btn-primary mt-5 w-full"
        >
          got it
        </button>
      </Sheet>
    </>
  );
}
