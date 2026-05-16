import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export default function IconButton({
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button {...rest} className={clsx('icon-btn', className)}>
      {children}
    </button>
  );
}
