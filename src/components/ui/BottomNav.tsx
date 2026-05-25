import { NavLink, Link } from 'react-router-dom';
import clsx from 'clsx';
import { hardRefresh } from '../../lib/hardRefresh';

const ITEMS = [
  { to: '/today', label: 'today', icon: '✦' },
  { to: '/notes', label: 'notes', icon: '✎' },
  { to: '/profile', label: 'you', icon: '◉' },
] as const;

export default function BottomNav() {
  return (
    <>
      <nav
        aria-label="primary"
        className="fixed bottom-[14px] left-1/2 z-50 flex -translate-x-1/2 gap-[2px] rounded-[24px] border-2 border-ink bg-ink p-[6px] shadow-[4px_4px_0_rgba(42,37,32,0.22)] md:hidden"
      >
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              clsx(
                'flex h-[42px] items-center justify-center gap-1.5 rounded-[18px] px-3 font-sans text-[14px] font-semibold transition-colors sm:px-4 sm:text-[15px]',
                isActive
                  ? 'bg-peach-deep text-ink'
                  : 'text-bg opacity-55 hover:opacity-90',
              )
            }
          >
            <span className="text-[14px]">{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* snap FAB — primary action post-pivot. coexists with the centered
       * nav pill and the bottom-left hardRefresh chip. */}
      <Link
        to="/snap"
        title="snap a journal page"
        aria-label="snap a journal page"
        className="fixed bottom-[16px] right-[14px] z-50 flex h-[52px] w-[52px] items-center justify-center rounded-[18px] border-2 border-ink bg-peach-deep text-[22px] text-ink shadow-card-lg transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-card md:hidden"
      >
        <span aria-hidden>✦</span>
      </Link>

      {/* hard-refresh chip — matches the desktop sidebar's v0.1 corner.
       * sits bottom-left of the viewport so the centered nav pill stays clean. */}
      <button
        onClick={hardRefresh}
        title="hard refresh"
        aria-label="hard refresh"
        className="fixed bottom-[20px] left-[14px] z-50 rounded-md px-1.5 py-1 font-mono text-[10px] uppercase tracking-mono-wide text-ink-faint transition-colors hover:bg-bg-soft hover:text-ink md:hidden"
      >
        v0.1
      </button>
    </>
  );
}
