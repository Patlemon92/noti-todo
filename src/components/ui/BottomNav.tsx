import { NavLink, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Camera } from 'lucide-react';

const ITEMS = [
  { to: '/day', label: 'my day', icon: '✦' },
  { to: '/projects', label: 'projects', icon: '▤' },
  { to: '/notes', label: 'notes', icon: '✎' },
  { to: '/profile', label: 'you', icon: '◉' },
] as const;

/**
 * Phone navigation: one full-width bar in thumb reach, icon over word so four
 * sections and the snap button fit a 375px screen without anything wrapping
 * or hiding behind anything else. (The hard-refresh chip moved to "you".)
 */
export default function BottomNav() {
  return (
    <nav
      aria-label="primary"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
      className="fixed inset-x-3 z-50 flex items-center gap-1 rounded-[24px] border-2 border-ink bg-ink p-1.5 shadow-[4px_4px_0_rgba(42,37,32,0.22)] md:hidden"
    >
      {ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) =>
            clsx(
              'flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-[1px] rounded-[18px] font-sans text-[12px] font-semibold leading-none transition-colors',
              isActive ? 'bg-peach-deep text-ink' : 'text-bg opacity-60 hover:opacity-90',
            )
          }
        >
          <span className="text-[15px]" aria-hidden>{it.icon}</span>
          <span className="whitespace-nowrap">{it.label}</span>
        </NavLink>
      ))}
      <Link
        to="/snap"
        title="snap a journal page"
        aria-label="snap a journal page"
        className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[18px] border-2 border-bg bg-peach-deep text-ink active:translate-y-[1px]"
      >
        <Camera size={22} strokeWidth={2.25} aria-hidden />
      </Link>
    </nav>
  );
}
