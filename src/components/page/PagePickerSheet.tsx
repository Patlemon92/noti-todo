import { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet';
import { searchPagesByTitle } from '../../lib/db';
import type { Page } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (page: Page) => void;
  excludeId?: string;
}

export default function PagePickerSheet({ open, onClose, onPick, excludeId }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    searchPagesByTitle(q, 12)
      .then((r) => {
        if (!active) return;
        setResults(r.filter((p) => p.id !== excludeId));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [q, open, excludeId]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="link a page"
      subtitle="creates a link from this page to the one you pick. backlinks update automatically."
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search by title…"
        className="mb-3 w-full rounded-[10px] border-2 border-ink bg-surface px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-faint"
      />
      <div className="max-h-[50vh] overflow-y-auto">
        {loading && (
          <div className="py-4 text-center font-mono text-[12px] text-ink-soft">
            searching…
          </div>
        )}
        {!loading && results.length === 0 && (
          <div className="py-4 text-center font-mono text-[12px] text-ink-soft">
            no pages match
          </div>
        )}
        {results.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onPick(p);
              onClose();
            }}
            className="flex w-full items-start gap-2.5 rounded-[10px] border border-transparent px-3 py-2 text-left hover:border-ink hover:bg-bg-soft"
          >
            <span className="mt-0.5 font-mono text-ink-soft">·</span>
            <span className="flex-1">
              <span className="block text-[14px] font-medium">
                {p.title || 'untitled'}
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-mono text-ink-soft">
                {p.type}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
