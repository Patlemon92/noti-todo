import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';

import BottomNav from '../components/ui/BottomNav';
import TopStrip from '../components/ui/TopStrip';
import {
  listTrash,
  permanentlyDeletePage,
  restorePage,
} from '../lib/db';
import type { Page, PageType } from '../lib/types';
import { docToPlaintext, snippet } from '../lib/tiptap';

const TYPE_GLYPH: Record<PageType, string> = {
  task: '▢',
  note: '✎',
  board: '▦',
  plain: '·',
};

const PURGE_DAYS = 5;

export default function TrashView() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listTrash();
      setPages(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRestore(p: Page) {
    setPages((cur) => cur.filter((x) => x.id !== p.id));
    try {
      await restorePage(p.id);
    } catch {
      void load();
    }
  }

  async function onPurge(p: Page) {
    if (!window.confirm(`delete "${p.title || 'untitled'}" forever? can't be undone.`)) {
      return;
    }
    setPages((cur) => cur.filter((x) => x.id !== p.id));
    try {
      await permanentlyDeletePage(p.id);
    } catch {
      void load();
    }
  }

  return (
    <div className="min-h-[100dvh] pb-32 pt-3">
      <div className="view-grid">
        <TopStrip right="minimal" />

        <div className="flex items-baseline justify-between px-3.5 pb-1">
          <h1 className="font-serif text-[26px] font-semibold leading-none">
            trash
          </h1>
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
            {pages.length} item{pages.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="px-3.5 pb-4 font-mono text-[11px] uppercase tracking-mono text-ink-faint">
          auto-removed after {PURGE_DAYS} days
        </p>

        {loading ? (
          <div className="mx-3.5 mt-4 rounded-[14px] border border-dashed border-ink-faint px-5 py-6 text-center font-mono text-[12px] uppercase tracking-mono text-ink-soft">
            loading…
          </div>
        ) : pages.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mx-3.5 flex flex-col gap-1.5">
            {pages.map((p) => (
              <TrashRow
                key={p.id}
                page={p}
                onRestore={() => onRestore(p)}
                onPurge={() => onPurge(p)}
              />
            ))}
          </ul>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function TrashRow({
  page,
  onRestore,
  onPurge,
}: {
  page: Page;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const preview = snippet(docToPlaintext(page.body) || page.body_text || '', 90);
  const deletedAt = page.deleted_at ? new Date(page.deleted_at) : null;
  const purgeAt = deletedAt
    ? new Date(deletedAt.getTime() + PURGE_DAYS * 86400000)
    : null;
  const daysLeft = purgeAt
    ? Math.max(0, Math.ceil((purgeAt.getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <li className="group flex items-start gap-2.5 rounded-[12px] border-[1.5px] border-ink bg-surface px-3 py-2.5 shadow-card-sm">
      <span className="mt-0.5 flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center font-mono text-[14px] text-ink-soft">
        {TYPE_GLYPH[page.type]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">
          {page.title || 'untitled'}
        </div>
        {preview && (
          <div className="mt-0.5 text-[12px] text-ink-soft">{preview}</div>
        )}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[10.5px] uppercase tracking-mono text-ink-faint">
          {deletedAt && (
            <span>
              deleted {formatDistanceToNowStrict(deletedAt, { addSuffix: false })} ago
            </span>
          )}
          {purgeAt && (
            <span className={clsx(daysLeft <= 1 && 'text-rose-deep')}>
              · {daysLeft === 0
                ? 'auto-removes today'
                : daysLeft === 1
                  ? 'auto-removes tomorrow'
                  : `${daysLeft} days left`}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          onClick={onRestore}
          className="rounded-pill border-[1.5px] border-ink bg-mint px-2.5 py-1 font-mono text-[10px] uppercase tracking-mono shadow-card-sm hover:bg-mint-deep/40"
          title="put it back"
        >
          ↺ restore
        </button>
        <button
          onClick={onPurge}
          className={clsx(
            'flex h-[28px] w-[28px] items-center justify-center rounded-md text-[12px] text-ink-soft transition-opacity hover:bg-rose hover:text-ink',
            'md:opacity-0 md:group-hover:opacity-100',
          )}
          title="delete forever"
          aria-label="delete forever"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mx-3.5 mt-4 rounded-[22px] border-2 border-dashed border-ink-faint bg-bg-soft px-5 py-9 text-center">
      <p className="mb-2 font-serif text-[20px] italic text-ink-soft">
        trash is empty.
      </p>
      <p className="text-[13px] text-ink-soft">
        deleted pages sit here for {PURGE_DAYS} days. restore them anytime, or
        let them go.
      </p>
    </div>
  );
}

void format;
