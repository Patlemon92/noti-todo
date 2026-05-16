import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

const ITEMS = [
  { to: '/focus', label: 'focus', icon: '★' },
  { to: '/boards', label: 'boards', icon: '▦' },
  { to: '/notes', label: 'notes', icon: '✎' },
  { to: '/profile', label: 'you', icon: '◉' },
] as const;

export default function BottomNav() {
  return (
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
  );
}
