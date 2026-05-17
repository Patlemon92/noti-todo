import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import {
  createPage,
  getDefaultBoard,
  searchPagesByTitle,
} from '../../lib/db';
import type { Page } from '../../lib/types';

interface Item {
  key: string;
  group: 'create' | 'nav' | 'search';
  label: string;
  desc?: string;
  icon: string;
  run: () => void | Promise<void>;
}

const NAV_TARGETS: Array<{ to: string; label: string; icon: string }> = [
  { to: '/focus', label: 'focus', icon: '★' },
  { to: '/boards', label: 'boards', icon: '▦' },
  { to: '/notes', label: 'notes', icon: '✎' },
  { to: '/done', label: 'done', icon: '✓' },
  { to: '/trash', label: 'trash', icon: '✕' },
  { to: '/profile', label: 'you', icon: '◉' },
];

interface Ctx {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

/** Returns the global command-palette controller. Mount one <CommandPaletteHost /> at app root. */
export function useCommandPalette(): Ctx {
  // we expose the underlying methods via window because there's exactly one host
  // — much simpler than a context that has to be threaded through every view.
  return useMemo(
    () => ({
      open: () => window.dispatchEvent(new CustomEvent('noti:cmdk-open')),
      close: () => window.dispatchEvent(new CustomEvent('noti:cmdk-close')),
      isOpen: false,
    }),
    [],
  );
}

export default function CommandPalette() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Page[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ----- open / close -----
  const handleOpen = useCallback(() => {
    if (!session) return;
    setOpen(true);
    setQuery('');
    setSelected(0);
  }, [session]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setSelected(0);
  }, []);

  // global ⌘K / ctrl+K binding
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) handleClose();
        else handleOpen();
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        handleClose();
        return;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handleOpen, handleClose]);

  // external open/close events
  useEffect(() => {
    const onOpenEvt = () => handleOpen();
    const onCloseEvt = () => handleClose();
    window.addEventListener('noti:cmdk-open', onOpenEvt);
    window.addEventListener('noti:cmdk-close', onCloseEvt);
    return () => {
      window.removeEventListener('noti:cmdk-open', onOpenEvt);
      window.removeEventListener('noti:cmdk-close', onCloseEvt);
    };
  }, [handleOpen, handleClose]);

  // focus the input when opened
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // search as you type
  useEffect(() => {
    if (!open) return;
    let active = true;
    const q = query.replace(/^[/?]/, '').trim();
    if (q.length < 1) {
      // no query — show recent pages as defaults
      void searchPagesByTitle('', 6).then((rows) => {
        if (active) setResults(rows);
      });
      return;
    }
    // text search across titles
    void searchTitlesAndBodies(q).then((rows) => {
      if (active) setResults(rows);
    });
    return () => {
      active = false;
    };
  }, [query, open]);

  // ----- compute items -----
  const items: Item[] = useMemo(() => {
    const q = query.replace(/^[/?]/, '').trim();
    const isNav = query.startsWith('/');
    const isSearch = query.startsWith('?') || !!q;
    const out: Item[] = [];

    if (!isNav && q) {
      out.push({
        key: 'create-task',
        group: 'create',
        label: `create task — ${q}`,
        desc: 'enter',
        icon: '▢',
        run: async () => {
          const board = await getDefaultBoard();
          await createPage({
            type: 'task',
            title: q,
            parent_id: board?.id ?? null,
            properties: { status: 'today' },
          });
          handleClose();
          nav('/focus');
        },
      });
      out.push({
        key: 'create-note',
        group: 'create',
        label: `create note — ${q}`,
        icon: '✎',
        run: async () => {
          const p = await createPage({ type: 'note', title: q });
          handleClose();
          nav(`/page/${p.id}`);
        },
      });
    }

    if (isSearch) {
      for (const p of results) {
        out.push({
          key: `page:${p.id}`,
          group: 'search',
          label: p.title || 'untitled',
          desc: p.type,
          icon: glyphForType(p.type),
          run: () => {
            handleClose();
            nav(`/page/${p.id}`);
          },
        });
      }
    }

    if (!q || isNav) {
      const navQ = isNav ? q.toLowerCase() : '';
      for (const t of NAV_TARGETS) {
        if (navQ && !t.label.includes(navQ)) continue;
        out.push({
          key: `nav:${t.to}`,
          group: 'nav',
          label: t.label,
          desc: t.to,
          icon: t.icon,
          run: () => {
            handleClose();
            nav(t.to);
          },
        });
      }
    }

    return out;
  }, [query, results, nav, handleClose]);

  // reset selection when items change
  useEffect(() => {
    setSelected(0);
  }, [items.length]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => (s + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => (s - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[selected];
      if (it) void it.run();
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-sm animate-fadeIn"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[540px] overflow-hidden rounded-[16px] border-[2.5px] border-ink bg-surface shadow-card-lg"
      >
        <div className="flex items-center gap-2 border-b-[1.5px] border-ink bg-bg-soft px-4 py-3">
          <span className="font-mono text-[14px] text-ink-soft">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="type to capture, ?search, /jump…"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
          <span className="hidden font-mono text-[10px] uppercase tracking-mono text-ink-faint sm:inline">
            esc
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-5 text-center font-mono text-[12px] uppercase tracking-mono text-ink-soft">
              start typing…
            </div>
          )}

          {/* group items by their group field with little separators */}
          {renderGroups(items, selected)}
        </div>

        <div className="flex items-center justify-between border-t-[1.5px] border-ink bg-bg-soft px-4 py-2 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
          <span>↑↓ to move · enter to run</span>
          <span>/ jump · ? search · type to add</span>
        </div>
      </div>
    </div>
  );
}

function renderGroups(items: Item[], selected: number) {
  const out: React.ReactNode[] = [];
  let lastGroup: Item['group'] | null = null;
  items.forEach((it, i) => {
    if (it.group !== lastGroup) {
      out.push(
        <div
          key={`hdr:${it.group}`}
          className={clsx(
            'px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-mono-wide text-ink-faint',
            lastGroup !== null && 'mt-1 border-t border-dashed border-black/[0.08] pt-3',
          )}
        >
          {it.group}
        </div>,
      );
      lastGroup = it.group;
    }
    out.push(<ItemRow key={it.key} item={it} active={i === selected} />);
  });
  return out;
}

function ItemRow({ item, active }: { item: Item; active: boolean }) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        void item.run();
      }}
      className={clsx(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] transition-colors',
        active ? 'bg-peach text-ink' : 'hover:bg-bg-soft',
      )}
    >
      <span className="w-5 text-center font-mono text-[14px] text-ink-soft">
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.desc && (
        <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
          {item.desc}
        </span>
      )}
    </button>
  );
}

function glyphForType(t: string) {
  if (t === 'task') return '▢';
  if (t === 'note') return '✎';
  if (t === 'board') return '▦';
  return '·';
}

/** Search across title + body_text. Falls back to title-only if RPC unavailable. */
async function searchTitlesAndBodies(q: string): Promise<Page[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from('pages')
    .select('id,owner_id,parent_id,type,title,body,body_text,properties,sort_order,archived,created_at,updated_at,completed_at')
    .eq('archived', false)
    .or(`title.ilike.%${trimmed}%,body_text.ilike.%${trimmed}%`)
    .order('updated_at', { ascending: false })
    .limit(12);
  if (error) return [];
  return (data ?? []) as Page[];
}
