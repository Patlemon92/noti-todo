import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { useCommandPalette } from '../cmd/CommandPalette';

const ITEMS = [
  { to: '/focus', label: 'focus', icon: '★' },
  { to: '/boards', label: 'boards', icon: '▦' },
  { to: '/notes', label: 'notes', icon: '✎' },
  { to: '/profile', label: 'you', icon: '◉' },
] as const;

/**
 * Desktop left rail. Hidden under 768px (BottomNav takes over there).
 * Width: 64px. Fixed-positioned. Matches the design system —
 * cream bg, 2px ink right edge, hard-offset chip on the active item.
 */
export default function Sidebar() {
  const cmd = useCommandPalette();
  return (
    <nav
      aria-label="primary"
      className="fixed inset-y-0 left-0 z-40 hidden w-[64px] flex-col items-center justify-between border-r-2 border-ink bg-bg/95 py-5 md:flex"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border-2 border-ink bg-surface shadow-card-sm"
          title="noti-todo"
        >
          <span className="font-serif text-[24px] font-semibold leading-none text-ink">
            n
          </span>
        </div>

        <div className="my-1 h-px w-7 bg-ink/15" />

        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            title={it.label}
            className={({ isActive }) =>
              clsx(
                'group relative flex h-[44px] w-[44px] items-center justify-center rounded-[12px] text-[18px] transition-colors',
                isActive
                  ? 'border-2 border-ink bg-peach-deep text-ink shadow-card-sm'
                  : 'text-ink-soft hover:bg-bg-soft hover:text-ink',
              )
            }
          >
            <span aria-hidden>{it.icon}</span>
            <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md border border-ink bg-ink px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-bg group-hover:block">
              {it.label}
            </span>
          </NavLink>
        ))}

        <div className="my-1 h-px w-7 bg-ink/15" />

        <button
          onClick={cmd.open}
          title="command palette (⌘K)"
          className="group relative flex h-[44px] w-[44px] items-center justify-center rounded-[12px] border border-dashed border-ink-faint text-ink-soft transition-colors hover:border-ink hover:bg-bg-soft hover:text-ink"
          aria-label="open command palette"
        >
          <span className="font-mono text-[12px] leading-none">⌘K</span>
          <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md border border-ink bg-ink px-2 py-1 font-mono text-[10px] uppercase tracking-mono text-bg group-hover:block">
            command palette
          </span>
        </button>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-mono-wide text-ink-faint">
        v0.1
      </div>
    </nav>
  );
}
