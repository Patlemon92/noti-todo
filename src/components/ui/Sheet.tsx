import { useEffect, type ReactNode } from 'react';
import clsx from 'clsx';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

export default function Sheet({ open, onClose, title, subtitle, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={clsx(
          'fixed inset-0 z-[100] bg-ink/40 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'fixed inset-x-0 bottom-0 z-[101] max-h-[88vh] overflow-y-auto rounded-t-[22px] border-t-[2.5px] border-ink bg-bg px-4 pb-7 pt-3.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-ink-faint" />
        {title && (
          <h2 className="mb-1 font-serif text-[19px] font-semibold">{title}</h2>
        )}
        {subtitle && (
          <p className="mb-4 text-[13px] text-ink-soft">{subtitle}</p>
        )}
        {children}
      </div>
    </>
  );
}
